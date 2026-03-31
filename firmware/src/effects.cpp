/**
 * @file effects.cpp
 */

#include "effects.h"
#include <hardware_config.h>

void EffectsEngine::reset() {
  lastBlinkMs_ = 0;
  lastSelfTestMs_ = 0;
  selfTestSlot_ = 1;
  selfTestForward_ = true;
}

void EffectsEngine::update(ShelfState& state, const LedMapper& mapper, uint32_t nowMs) {
  updateDemoPhase(state, nowMs);

  if (state.mode == ShelfMode::BLINK_SLOT) {
    updateBlink(state, nowMs);
  } else {
    state.blinkHighlightVisible = true;
  }

  if (state.mode == ShelfMode::SELF_TEST) {
    updateSelfTest(state, mapper, nowMs);
  } else {
    selfTestSlot_ = 1;
    selfTestForward_ = true;
    lastSelfTestMs_ = 0;
  }
}

void EffectsEngine::updateBlink(ShelfState& state, uint32_t nowMs) {
  if (lastBlinkMs_ == 0) lastBlinkMs_ = nowMs;
  if (nowMs - lastBlinkMs_ >= BLINK_HALF_PERIOD_MS) {
    lastBlinkMs_ = nowMs;
    state.blinkHighlightVisible = !state.blinkHighlightVisible;
  }
}

void EffectsEngine::updateDemoPhase(ShelfState& state, uint32_t nowMs) {
  if (state.mode != ShelfMode::DEMO) return;
  // Map time -> 0–255 phase for rainbow / effects
  const uint32_t period = DEMO_HUE_CYCLE_MS;
  const uint32_t t = nowMs % period;
  state.effectPhase = static_cast<uint8_t>((t * 256u) / period);
}

void EffectsEngine::updateSelfTest(ShelfState& state, const LedMapper& mapper, uint32_t nowMs) {
  const uint16_t maxS = mapper.maxSlotCount();
  if (maxS == 0) return;

  if (lastSelfTestMs_ == 0) lastSelfTestMs_ = nowMs;
  if (nowMs - lastSelfTestMs_ < STARTUP_CHASE_STEP_MS * 2u) return;
  lastSelfTestMs_ = nowMs;

  if (selfTestForward_) {
    if (selfTestSlot_ < maxS) {
      selfTestSlot_++;
    } else {
      selfTestForward_ = false;
      selfTestSlot_--;
    }
  } else {
    if (selfTestSlot_ > 1) {
      selfTestSlot_--;
    } else {
      selfTestForward_ = true;
      selfTestSlot_++;
    }
  }

  state.selectedSlot = selfTestSlot_;
}
