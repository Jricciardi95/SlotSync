/**
 * @file shelf_types.h
 * @brief Core enums and data structures for shelf state, settings, and calibration.
 */

#pragma once

#include <FastLED.h>
#include <Arduino.h>
#include <cstddef>

// Maximum slots we can track for multi-select / cleanup (RAM bound; adjust per product).
#ifndef SHELVE_MAX_MULTI_SLOTS
#define SHELVE_MAX_MULTI_SLOTS 16
#endif

enum class ShelfMode : uint8_t {
  BOOT = 0,    // transient — startup diagnostic
  IDLE,
  SELECTED,       // dim shelf + bright selected slot(s)
  CLEAR,          // all off
  DEMO,           // product demo / retailer mode
  SELF_TEST,      // manufacturing / bring-up
  BLINK_SLOT,     // highlight with periodic blink
  PULSE,          // reserved — future breathing/pulse highlight
  WAVE,           // reserved
  PARTY,          // reserved
  CLEANUP,        // reserved — “return bins” glow
  MUSIC_REACTIVE, // reserved — microphone driven
};

enum class HighlightStyle : uint8_t {
  Solid = 0,
  Blink,
  Pulse,
};

/**
 * Physical install calibration. All distances are in “LED index space” per strip.
 */
struct ShelfCalibration {
  uint16_t ledsPerOddStrip;
  uint16_t ledsPerEvenStrip;
  /** Added to logical slot index before reverse mapping (can be negative in future). */
  int16_t oddOffset;
  int16_t evenOffset;
  bool reverseOddStrip;
  bool reverseEvenStrip;
};

/**
 * User-facing preferences (eventually persisted to NVS).
 */
struct ShelfSettings {
  CRGB idleColor;          // ambient
  CRGB selectedColor;      // highlight
  CRGB backgroundDimColor; // for SELECTED mode base (often same as idle, scaled down in renderer)
  uint8_t brightness;      // master 0–255
  uint8_t idleScale;       // fraction of brightness for idle (0–255, default ~60)
  uint8_t backgroundScale; // dim shelf behind selection (0–255, e.g. 25)
  /** Effect / music placeholders */
  uint8_t effectSpeed;     // abstract 0–255
  uint8_t micSensitivity;  // 0–255, future ADC gain target
  bool musicReactiveEnabled;
  bool beatFollowEnabled;  // future
  HighlightStyle highlightStyle;
};

/**
 * Volatile runtime state — what the renderer and APIs mutate.
 */
struct ShelfState {
  ShelfMode mode;
  /** Primary selection (app / serial). */
  uint16_t selectedSlot;
  /** Multi-slot (cleanup, multi-album). Slots are 1-based; 0 = empty slot in array. */
  uint16_t multiSlots[SHELVE_MAX_MULTI_SLOTS];
  uint8_t multiSlotCount;
  ShelfSettings settings;
  ShelfCalibration calibration;

  /** Effect phase (0–255) advanced by Effects engine each frame. */
  uint8_t effectPhase;
  /** Non-blocking blink: true = show highlight, false = show background only for slot. */
  bool blinkHighlightVisible;

  void clearMultiSlots();
  bool addMultiSlot(uint16_t slot1Based);
  void setPrimarySlot(uint16_t slot1Based);
};

inline void ShelfState::clearMultiSlots() {
  multiSlotCount = 0;
  for (size_t i = 0; i < SHELVE_MAX_MULTI_SLOTS; i++) {
    multiSlots[i] = 0;
  }
}

inline bool ShelfState::addMultiSlot(uint16_t slot1Based) {
  if (slot1Based == 0 || multiSlotCount >= SHELVE_MAX_MULTI_SLOTS) return false;
  for (uint8_t i = 0; i < multiSlotCount; i++) {
    if (multiSlots[i] == slot1Based) return true;
  }
  multiSlots[multiSlotCount++] = slot1Based;
  return true;
}

inline void ShelfState::setPrimarySlot(uint16_t slot1Based) {
  selectedSlot = slot1Based;
}
