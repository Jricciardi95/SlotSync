/**
 * @file serial_cli.cpp
 */

#include "serial_cli.h"
#include "persistence.h"
#include "shelf_strings.h"

#include <hardware_config.h>

#include <Arduino.h>
#include <cstring>

namespace {

constexpr size_t kBuf = 160;
char lineBuf[kBuf];
size_t lineLen = 0;

void printStatus(ShelfState& state, LedMapper& mapper) {
  Serial.println(F("--- SlotSync shelf status ---"));
  Serial.print(F("mode: "));
  Serial.println(shelfModeToString(state.mode));
  Serial.print(F("selected_slot: "));
  Serial.println(state.selectedSlot);
  Serial.print(F("multi_count: "));
  Serial.println(state.multiSlotCount);
  Serial.print(F("max_slot: "));
  Serial.println(mapper.maxSlotCount());
  Serial.print(F("brightness: "));
  Serial.println(state.settings.brightness);
  Serial.print(F("idle RGB: "));
  Serial.print(state.settings.idleColor.r);
  Serial.print(' ');
  Serial.print(state.settings.idleColor.g);
  Serial.print(' ');
  Serial.println(state.settings.idleColor.b);
  Serial.print(F("selected RGB: "));
  Serial.print(state.settings.selectedColor.r);
  Serial.print(' ');
  Serial.print(state.settings.selectedColor.g);
  Serial.print(' ');
  Serial.println(state.settings.selectedColor.b);
  Serial.print(F("cal odd/even leds: "));
  Serial.print(state.calibration.ledsPerOddStrip);
  Serial.print(' ');
  Serial.println(state.calibration.ledsPerEvenStrip);
  Serial.print(F("offset odd/even: "));
  Serial.print(state.calibration.oddOffset);
  Serial.print(' ');
  Serial.println(state.calibration.evenOffset);
  {
    StripId st;
    uint16_t ix = 0;
    if (mapper.mapSlot(1, st, ix)) {
      Serial.print(F("map slot 1 -> "));
      Serial.print(st == StripId::Odd ? F("ODD") : F("EVEN"));
      Serial.print(F(" led "));
      Serial.println(ix);
    }
    if (mapper.mapSlot(2, st, ix)) {
      Serial.print(F("map slot 2 -> "));
      Serial.print(st == StripId::Odd ? F("ODD") : F("EVEN"));
      Serial.print(F(" led "));
      Serial.println(ix);
    }
  }
  Serial.print(F("reverse odd/even: "));
  Serial.print(state.calibration.reverseOddStrip);
  Serial.print(' ');
  Serial.println(state.calibration.reverseEvenStrip);
  Serial.println(F("-----------------------------"));
}

bool parseUInt(const char* s, uint16_t& out) {
  if (s == nullptr || *s == '\0') return false;
  uint32_t v = 0;
  for (const char* p = s; *p; ++p) {
    if (*p < '0' || *p > '9') return false;
    v = v * 10u + static_cast<uint32_t>(*p - '0');
    if (v > 65535u) return false;
  }
  out = static_cast<uint16_t>(v);
  return true;
}

bool parseByte(const char* s, uint8_t& out) {
  uint16_t v{};
  if (!parseUInt(s, v) || v > 255u) return false;
  out = static_cast<uint8_t>(v);
  return true;
}

void dispatchLine(ShelfState& state, LedMapper& mapper, char* line) {
  // Strip newline
  while (*line == ' ' || *line == '\t') line++;
  if (*line == '\0') return;

  char* cmd = strtok(line, " \t");
  if (!cmd) return;

  // Lowercase cmd in place (simple)
  for (char* p = cmd; *p; ++p) {
    if (*p >= 'A' && *p <= 'Z') *p = static_cast<char>(*p - 'A' + 'a');
  }

  Serial.print(F("[serial] cmd="));
  Serial.println(cmd);

  if (strcmp(cmd, "idle") == 0) {
    state.mode = ShelfMode::IDLE;
    state.clearMultiSlots();
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: idle"));
    return;
  }
  if (strcmp(cmd, "clear") == 0) {
    state.mode = ShelfMode::CLEAR;
    state.clearMultiSlots();
    state.selectedSlot = 0;
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: clear"));
    return;
  }
  if (strcmp(cmd, "demo") == 0) {
    state.mode = ShelfMode::DEMO;
    state.clearMultiSlots();
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: demo"));
    return;
  }
  if (strcmp(cmd, "test") == 0) {
    state.mode = ShelfMode::SELF_TEST;
    state.clearMultiSlots();
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: self_test"));
    return;
  }
  if (strcmp(cmd, "status") == 0) {
    printStatus(state, mapper);
    return;
  }
  if (strcmp(cmd, "music_on") == 0) {
    state.settings.musicReactiveEnabled = true;
    state.mode = ShelfMode::MUSIC_REACTIVE;
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: music on (stub audio)"));
    return;
  }
  if (strcmp(cmd, "music_off") == 0) {
    state.settings.musicReactiveEnabled = false;
    state.mode = ShelfMode::IDLE;
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: music off"));
    return;
  }

  if (strcmp(cmd, "slot") == 0) {
    char* arg = strtok(nullptr, " \t");
    uint16_t slot{};
    if (!arg || !parseUInt(arg, slot) || !mapper.isValidSlot(slot)) {
      Serial.println(F("err: slot <num>"));
      return;
    }
    state.mode = ShelfMode::SELECTED;
    state.clearMultiSlots();
    state.selectedSlot = slot;
    persistenceSaveCalibrationAndSettings(state);
    Serial.print(F("ok: selected "));
    Serial.println(slot);
    return;
  }

  if (strcmp(cmd, "slots") == 0) {
    char* arg = strtok(nullptr, " \t");
    if (!arg) {
      Serial.println(F("err: slots 1,3,5"));
      return;
    }
    state.clearMultiSlots();
    char* p = arg;
    while (p && *p) {
      while (*p == ' ' || *p == ',' || *p == '\t') p++;
      if (*p == '\0') break;
      uint16_t acc = 0;
      while (*p >= '0' && *p <= '9') {
        acc = static_cast<uint16_t>(acc * 10u + static_cast<uint16_t>(*p - '0'));
        p++;
      }
      if (acc == 0 || !mapper.isValidSlot(acc)) {
        Serial.println(F("err: invalid slot in list"));
        state.clearMultiSlots();
        return;
      }
      state.addMultiSlot(acc);
      if (*p == ',') p++;
    }
    if (state.multiSlotCount == 0) {
      Serial.println(F("err: no slots parsed"));
      return;
    }
    state.mode = ShelfMode::SELECTED;
    state.selectedSlot = state.multiSlots[0];
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: multi select"));
    return;
  }

  if (strcmp(cmd, "blink") == 0) {
    char* arg = strtok(nullptr, " \t");
    uint16_t slot{};
    if (!arg || !parseUInt(arg, slot) || !mapper.isValidSlot(slot)) {
      Serial.println(F("err: blink <num>"));
      return;
    }
    state.mode = ShelfMode::BLINK_SLOT;
    state.clearMultiSlots();
    state.selectedSlot = slot;
    state.blinkHighlightVisible = true;
    persistenceSaveCalibrationAndSettings(state);
    Serial.print(F("ok: blink "));
    Serial.println(slot);
    return;
  }

  if (strcmp(cmd, "brightness") == 0) {
    char* arg = strtok(nullptr, " \t");
    uint8_t b{};
    if (!arg || !parseByte(arg, b)) {
      Serial.println(F("err: brightness 0-255"));
      return;
    }
    state.settings.brightness = b;
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: brightness"));
    return;
  }

  if (strcmp(cmd, "idlecolor") == 0) {
    char *r = strtok(nullptr, " \t"), *g = strtok(nullptr, " \t"), *b = strtok(nullptr, " \t");
    uint8_t rr{}, gg{}, bb{};
    if (!r || !g || !b || !parseByte(r, rr) || !parseByte(g, gg) || !parseByte(b, bb)) {
      Serial.println(F("err: idlecolor r g b"));
      return;
    }
    state.settings.idleColor = CRGB(rr, gg, bb);
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: idlecolor"));
    return;
  }

  if (strcmp(cmd, "selectedcolor") == 0) {
    char *r = strtok(nullptr, " \t"), *g = strtok(nullptr, " \t"), *b = strtok(nullptr, " \t");
    uint8_t rr{}, gg{}, bb{};
    if (!r || !g || !b || !parseByte(r, rr) || !parseByte(g, gg) || !parseByte(b, bb)) {
      Serial.println(F("err: selectedcolor r g b"));
      return;
    }
    state.settings.selectedColor = CRGB(rr, gg, bb);
    persistenceSaveCalibrationAndSettings(state);
    Serial.println(F("ok: selectedcolor"));
    return;
  }

  if (strcmp(cmd, "help") == 0) {
    Serial.println(F("Commands: idle | clear | demo | test | status | slot N | slots 1,2 | blink N | "
                     "brightness B | idlecolor R G B | selectedcolor R G B | music_on | music_off"));
    return;
  }

  Serial.println(F("err: unknown (type help)"));
}

}  // namespace

void serialCliPoll(ShelfState& state, LedMapper& mapper) {
  while (Serial.available() > 0) {
    char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      lineLen = 0;
      dispatchLine(state, mapper, lineBuf);
      continue;
    }
    if (lineLen + 1 >= kBuf) {
      lineLen = 0;
      Serial.println(F("err: line overflow"));
      continue;
    }
    lineBuf[lineLen++] = c;
  }
}
