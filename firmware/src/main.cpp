/**
 * @file main.cpp
 * @brief SlotSync smart shelf — entrypoint, bring-up, main non-blocking loop.
 *
 * Update pipeline (each `loop()` iteration):
 *   1. `pollWifi()`        — reconnect without blocking other work
 *   2. `httpApiPoll()`     — HTTP API (JSON control plane)
 *   3. `serialCliPoll()`   — Manufacturing / bench commands
 *   4. `audio.update()`    — Future mic DSP (stub today)
 *   5. `effects.update()`  — Blink / demo phase / self-test sequencer
 *   6. `renderer.render()` — Base → music overlay → highlights
 *   7. `FastLED.show()`    — Push buffers to WS2812B timing
 */

#include <Arduino.h>
#include <FastLED.h>
#include <WiFi.h>

#include <hardware_config.h>

#if __has_include(<wifi_credentials.h>)
#include <wifi_credentials.h>
#else
#ifndef SLOTsync_WIFI_SSID
#define SLOTsync_WIFI_SSID ""
#endif
#ifndef SLOTsync_WIFI_PASS
#define SLOTsync_WIFI_PASS ""
#endif
#endif

#include "audio_input.h"
#include "effects.h"
#include "http_api.h"
#include "led_mapper.h"
#include "persistence.h"
#include "renderer.h"
#include "serial_cli.h"
#include "shelf_types.h"

// ---------------------------------------------------------------------------
// FastLED buffers (two logical strips)
// ---------------------------------------------------------------------------
CRGB gLedsOdd[SHELF_LEDS_PER_ODD_STRIP];
CRGB gLedsEven[SHELF_LEDS_PER_EVEN_STRIP];

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------
ShelfState gState{};
LedMapper gMapper{};
AudioInput gAudio{};
EffectsEngine gEffects{};
Renderer gRenderer(gLedsOdd, SHELF_LEDS_PER_ODD_STRIP, gLedsEven, SHELF_LEDS_PER_EVEN_STRIP, gAudio);

uint32_t gLastWifiAttemptMs = 0;
bool gHttpStarted = false;

// ---------------------------------------------------------------------------
// Factory defaults — overwritten by NVS when keys exist.
// ---------------------------------------------------------------------------
static void applyFactoryDefaults(ShelfState& s) {
  s.mode = ShelfMode::IDLE;
  s.selectedSlot = 0;
  s.clearMultiSlots();
  s.settings.idleColor = CRGB(12, 0, 28);
  s.settings.selectedColor = CRGB(255, 255, 255);
  s.settings.backgroundDimColor = s.settings.idleColor;
  s.settings.brightness = 96;
  s.settings.idleScale = 72;
  s.settings.backgroundScale = 38;
  s.settings.effectSpeed = 140;
  s.settings.micSensitivity = 150;
  s.settings.musicReactiveEnabled = false;
  s.settings.beatFollowEnabled = false;
  s.settings.highlightStyle = HighlightStyle::Solid;

  s.calibration.ledsPerOddStrip = SHELF_LEDS_PER_ODD_STRIP;
  s.calibration.ledsPerEvenStrip = SHELF_LEDS_PER_EVEN_STRIP;
  s.calibration.oddOffset = 0;
  s.calibration.evenOffset = 0;
  s.calibration.reverseOddStrip = false;
  s.calibration.reverseEvenStrip = false;

  s.effectPhase = 0;
  s.blinkHighlightVisible = true;
}

static void runStartupChase(LedMapper& mapper) {
  auto allOff = []() {
    fill_solid(gLedsOdd, SHELF_LEDS_PER_ODD_STRIP, CRGB::Black);
    fill_solid(gLedsEven, SHELF_LEDS_PER_EVEN_STRIP, CRGB::Black);
  };

  const CRGB warm = CRGB(30, 24, 40);
  const uint16_t maxS = mapper.maxSlotCount();
  for (uint16_t slot = 1; slot <= maxS; slot++) {
    allOff();
    StripId strip{};
    uint16_t ix = 0;
    if (mapper.mapSlot(slot, strip, ix)) {
      if (strip == StripId::Odd && ix < SHELF_LEDS_PER_ODD_STRIP) {
        gLedsOdd[ix] = warm;
      } else if (strip == StripId::Even && ix < SHELF_LEDS_PER_EVEN_STRIP) {
        gLedsEven[ix] = warm;
      }
    }
    FastLED.show();
    delay(STARTUP_CHASE_STEP_MS);  // Setup-only diagnostic; not used in main loop.
  }
  allOff();
  FastLED.show();
}

static void wifiMaintain() {
  if (strlen(SLOTsync_WIFI_SSID) == 0) {
    static bool warned = false;
    if (!warned) {
      warned = true;
      Serial.println(
          F("[wifi] SLOTsync_WIFI_SSID empty — copy include/wifi_credentials.example.h -> "
            "wifi_credentials.h")));
    }
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (!gHttpStarted) {
      gHttpStarted = httpApiBegin(gState, gMapper);
    }
    return;
  }

  const uint32_t now = millis();
  if (gLastWifiAttemptMs != 0 && (now - gLastWifiAttemptMs) < WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }
  gLastWifiAttemptMs = now;

  Serial.printf("[wifi] connecting \"%s\"...\n", SLOTsync_WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(SLOTsync_WIFI_SSID, SLOTsync_WIFI_PASS);

  // Intended for setup / rare reconnect — keep timeout bounded.
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(150);
    serialCliPoll(gState, gMapper);
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (!gHttpStarted) {
      gHttpStarted = httpApiBegin(gState, gMapper);
    }
    Serial.print(F("[wifi] connected "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("[wifi] failed (will retry)"));
    WiFi.disconnect(true, false);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println(F("SlotSync shelf firmware — boot"));

  applyFactoryDefaults(gState);
  persistenceLoadCalibrationAndSettings(gState);
  gMapper.setCalibration(gState.calibration);

  Serial.printf(
      "[hw] LED odd GPIO %d / even GPIO %d | LEDs %u / %u | max logical slot %u\n",
      PIN_LED_ODD_STRIP, PIN_LED_EVEN_STRIP,
      static_cast<unsigned>(SHELF_LEDS_PER_ODD_STRIP),
      static_cast<unsigned>(SHELF_LEDS_PER_EVEN_STRIP),
      static_cast<unsigned>(gMapper.maxSlotCount()));
  Serial.println(F("[hw] HTTP API: matches SlotSync app shelfApi.ts (see firmware/APP_HTTP_CONTRACT.md)"));

  gAudio.begin();

  FastLED.addLeds<WS2812B, PIN_LED_ODD_STRIP, LED_COLOR_ORDER>(gLedsOdd, SHELF_LEDS_PER_ODD_STRIP);
  FastLED.addLeds<WS2812B, PIN_LED_EVEN_STRIP, LED_COLOR_ORDER>(gLedsEven,
                                                                SHELF_LEDS_PER_EVEN_STRIP);
  FastLED.setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(255);  // Headroom — Renderer scales per-pixel.

  gState.mode = ShelfMode::BOOT;
  runStartupChase(gMapper);

  gState.mode = ShelfMode::IDLE;
  gEffects.reset();

  wifiMaintain();

  Serial.println(F("Ready. Serial: type `help`."));
}

void loop() {
  const uint32_t now = millis();

  wifiMaintain();

  // Once Wi-Fi comes up later, ensure HTTP begins exactly once.
  if (WiFi.status() == WL_CONNECTED && !gHttpStarted) {
    gHttpStarted = httpApiBegin(gState, gMapper);
  }

  httpApiPoll();
  serialCliPoll(gState, gMapper);

  gAudio.update(now);
  gEffects.update(gState, gMapper, now);
  gRenderer.render(gState, gMapper, now);
  FastLED.show();
}
