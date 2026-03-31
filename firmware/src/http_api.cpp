/**
 * @file http_api.cpp
 */

#include "http_api.h"
#include "persistence.h"
#include "shelf_strings.h"

#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>

#include <hardware_config.h>

#if SHELF_HTTP_REQUEST_LOG
#define HTTP_LOGF(fmt, ...) Serial.printf("[http] " fmt "\n", ##__VA_ARGS__)
#else
#define HTTP_LOGF(...)
#endif

namespace {

WebServer server(80);

ShelfState* gState = nullptr;
LedMapper* gMapper = nullptr;
bool gListening = false;

void sendJson(int code, JsonDocument& doc) {
  String body;
  serializeJson(doc, body);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(code, "application/json", body);
}

void handleStatus() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /status");
  JsonDocument doc;
  doc["ok"] = true;
  doc["mode"] = shelfModeToString(gState->mode);
  doc["selected_slot"] = gState->selectedSlot;
  doc["multi_count"] = gState->multiSlotCount;
  JsonArray slots = doc["multi_slots"].to<JsonArray>();
  for (uint8_t i = 0; i < gState->multiSlotCount; i++) {
    slots.add(gState->multiSlots[i]);
  }
  doc["max_slot"] = gMapper->maxSlotCount();
  doc["brightness"] = gState->settings.brightness;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["wifi_ip"] = WiFi.localIP().toString();
  doc["uptime_ms"] = millis();

  doc["idle"]["r"] = gState->settings.idleColor.r;
  doc["idle"]["g"] = gState->settings.idleColor.g;
  doc["idle"]["b"] = gState->settings.idleColor.b;

  doc["selected_color"]["r"] = gState->settings.selectedColor.r;
  doc["selected_color"]["g"] = gState->settings.selectedColor.g;
  doc["selected_color"]["b"] = gState->settings.selectedColor.b;

  doc["music_reactive"] = gState->settings.musicReactiveEnabled;
  doc["firmware"] = "slotsync-mvp-0.1";

  sendJson(200, doc);
}

bool parseUintParam(const String& s, uint16_t& out) {
  if (s.length() == 0) return false;
  uint32_t v = 0;
  for (unsigned i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c < '0' || c > '9') return false;
    v = v * 10u + static_cast<uint32_t>(c - '0');
    if (v > 65535u) return false;
  }
  out = static_cast<uint16_t>(v);
  return true;
}

void handleIdle() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /idle");
  gState->mode = ShelfMode::IDLE;
  gState->clearMultiSlots();
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  doc["mode"] = "idle";
  sendJson(200, doc);
}

void handleClear() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /clear");
  gState->mode = ShelfMode::CLEAR;
  gState->clearMultiSlots();
  gState->selectedSlot = 0;
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  doc["mode"] = "clear";
  sendJson(200, doc);
}

void handleDemo() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /demo");
  gState->mode = ShelfMode::DEMO;
  gState->clearMultiSlots();
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  doc["mode"] = "demo";
  sendJson(200, doc);
}

void handleSelfTestAlias() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /test (selftest)");
  gState->mode = ShelfMode::SELF_TEST;
  gState->clearMultiSlots();
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  doc["mode"] = "selftest";
  sendJson(200, doc);
}

void handleSlot() {
  if (!gState || !gMapper) return;
  const String n = server.arg("num");
  HTTP_LOGF("GET /slot num=%s", n.c_str());
  uint16_t slot{};
  if (!parseUintParam(n, slot) || !gMapper->isValidSlot(slot)) {
    HTTP_LOGF("  -> 400 invalid slot num=%s max=%u", n.c_str(),
              static_cast<unsigned>(gMapper->maxSlotCount()));
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "invalid slot";
    sendJson(400, doc);
    return;
  }
  gState->mode = ShelfMode::SELECTED;
  gState->clearMultiSlots();
  gState->selectedSlot = slot;
  persistenceSaveCalibrationAndSettings(*gState);
  HTTP_LOGF("  -> 200 selected slot=%u", static_cast<unsigned>(slot));
  JsonDocument doc;
  doc["ok"] = true;
  doc["slot"] = slot;
  sendJson(200, doc);
}

void handleBlink() {
  if (!gState || !gMapper) return;
  const String n = server.arg("num");
  HTTP_LOGF("GET /blink num=%s", n.c_str());
  uint16_t slot{};
  if (!parseUintParam(n, slot) || !gMapper->isValidSlot(slot)) {
    HTTP_LOGF("  -> 400 blink invalid num=%s", n.c_str());
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "invalid slot";
    sendJson(400, doc);
    return;
  }
  gState->mode = ShelfMode::BLINK_SLOT;
  gState->clearMultiSlots();
  gState->selectedSlot = slot;
  gState->blinkHighlightVisible = true;
  persistenceSaveCalibrationAndSettings(*gState);
  HTTP_LOGF("  -> 200 blink slot=%u", static_cast<unsigned>(slot));
  JsonDocument doc;
  doc["ok"] = true;
  doc["slot"] = slot;
  doc["mode"] = "blink";
  sendJson(200, doc);
}

void handleBrightness() {
  if (!gState || !gMapper) return;
  const String v = server.arg("value");
  HTTP_LOGF("GET /brightness value=%s", v.c_str());
  uint16_t b16{};
  if (!parseUintParam(v, b16) || b16 > 255) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "invalid brightness";
    sendJson(400, doc);
    return;
  }
  gState->settings.brightness = static_cast<uint8_t>(b16);
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  doc["brightness"] = gState->settings.brightness;
  sendJson(200, doc);
}

void handleIdleColor() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /idlecolor r=%s g=%s b=%s", server.arg("r").c_str(), server.arg("g").c_str(),
            server.arg("b").c_str());
  uint16_t r{}, g{}, b{};
  if (!parseUintParam(server.arg("r"), r) || !parseUintParam(server.arg("g"), g) ||
      !parseUintParam(server.arg("b"), b) || r > 255 || g > 255 || b > 255) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "invalid rgb";
    sendJson(400, doc);
    return;
  }
  gState->settings.idleColor = CRGB(static_cast<uint8_t>(r), static_cast<uint8_t>(g),
                                     static_cast<uint8_t>(b));
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  sendJson(200, doc);
}

void handleSelectedColor() {
  if (!gState || !gMapper) return;
  HTTP_LOGF("GET /selectedcolor r=%s g=%s b=%s", server.arg("r").c_str(),
            server.arg("g").c_str(), server.arg("b").c_str());
  uint16_t r{}, g{}, b{};
  if (!parseUintParam(server.arg("r"), r) || !parseUintParam(server.arg("g"), g) ||
      !parseUintParam(server.arg("b"), b) || r > 255 || g > 255 || b > 255) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "invalid rgb";
    sendJson(400, doc);
    return;
  }
  gState->settings.selectedColor = CRGB(static_cast<uint8_t>(r), static_cast<uint8_t>(g),
                                         static_cast<uint8_t>(b));
  persistenceSaveCalibrationAndSettings(*gState);
  JsonDocument doc;
  doc["ok"] = true;
  sendJson(200, doc);
}

void handleMultiSlot() {
  if (!gState || !gMapper) return;
  const String raw = server.arg("nums");
  HTTP_LOGF("GET /slots nums=%s", raw.c_str());
  if (raw.length() == 0) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "nums required";
    sendJson(400, doc);
    return;
  }
  gState->clearMultiSlots();

  unsigned i = 0;
  while (i < raw.length()) {
    while (i < raw.length() && (raw[i] == ' ' || raw[i] == ',' || raw[i] == '\t')) i++;
    if (i >= raw.length()) break;
    unsigned j = i;
    while (j < raw.length() && raw[j] >= '0' && raw[j] <= '9') j++;
    if (j == i) {
      gState->clearMultiSlots();
      JsonDocument doc;
      doc["ok"] = false;
      doc["error"] = "bad nums format";
      sendJson(400, doc);
      return;
    }
    const uint16_t slot = static_cast<uint16_t>(raw.substring(i, j).toInt());
    if (slot == 0 || !gMapper->isValidSlot(slot)) {
      gState->clearMultiSlots();
      JsonDocument doc;
      doc["ok"] = false;
      doc["error"] = "invalid slot in list";
      sendJson(400, doc);
      return;
    }
    gState->addMultiSlot(slot);
    i = j;
  }

  if (gState->multiSlotCount == 0) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "empty list";
    sendJson(400, doc);
    return;
  }

  gState->mode = ShelfMode::SELECTED;
  gState->selectedSlot = gState->multiSlots[0];
  persistenceSaveCalibrationAndSettings(*gState);
  HTTP_LOGF("  -> 200 multi count=%u primary slot=%u", gState->multiSlotCount,
            static_cast<unsigned>(gState->selectedSlot));
  JsonDocument doc;
  doc["ok"] = true;
  doc["count"] = gState->multiSlotCount;
  sendJson(200, doc);
}

void handleNotFound() {
  HTTP_LOGF("404 %s", server.uri().c_str());
  JsonDocument doc;
  doc["ok"] = false;
  doc["error"] = "not_found";
  sendJson(404, doc);
}

}  // namespace

bool httpApiBegin(ShelfState& state, LedMapper& mapper) {
  if (gListening) {
    gState = &state;
    gMapper = &mapper;
    return true;
  }

  gState = &state;
  gMapper = &mapper;

  server.on("/status", HTTP_GET, handleStatus);
  server.on("/idle", HTTP_GET, handleIdle);
  server.on("/clear", HTTP_GET, handleClear);
  server.on("/demo", HTTP_GET, handleDemo);
  server.on("/test", HTTP_GET, handleSelfTestAlias);
  server.on("/slot", HTTP_GET, handleSlot);
  server.on("/blink", HTTP_GET, handleBlink);
  server.on("/brightness", HTTP_GET, handleBrightness);
  server.on("/idlecolor", HTTP_GET, handleIdleColor);
  server.on("/selectedcolor", HTTP_GET, handleSelectedColor);
  server.on("/slots", HTTP_GET, handleMultiSlot);

  server.onNotFound(handleNotFound);
  server.begin();
  gListening = true;
#if VERBOSE_DEBUG
  Serial.println(F("[http] server started :80"));
#endif
  return true;
}

void httpApiPoll() {
  if (!gListening) return;
  server.handleClient();
}
