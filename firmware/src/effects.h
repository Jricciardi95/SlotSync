/**
 * @file effects.h
 * @brief Non-blocking animation / demo / blink timing (millis-based).
 */

#pragma once

#include "shelf_types.h"
#include "led_mapper.h"

class EffectsEngine {
 public:
  void reset();

  /**
   * Advance effect timers and mutate ShelfState fields (blink flag, effect phase).
   * Call once per main loop before rendering.
   */
  void update(ShelfState& state, const LedMapper& mapper, uint32_t nowMs);

 private:
  uint32_t lastBlinkMs_{0};
  uint32_t lastSelfTestMs_{0};
  uint16_t selfTestSlot_{1};  // 1-based, walks 1..maxSlots
  bool selfTestForward_{true};

  void updateBlink(ShelfState& state, uint32_t nowMs);
  void updateDemoPhase(ShelfState& state, uint32_t nowMs);
  void updateSelfTest(ShelfState& state, const LedMapper& mapper, uint32_t nowMs);
};
