/**
 * @file renderer.cpp
 */

#include "renderer.h"
#include "audio_input.h"

Renderer::Renderer(CRGB* ledsOdd, uint16_t oddCount, CRGB* ledsEven, uint16_t evenCount,
                   AudioInput& audio)
    : ledsOdd_(ledsOdd),
      ledsEven_(ledsEven),
      oddCount_(oddCount),
      evenCount_(evenCount),
      audio_(&audio) {}

CRGB Renderer::scaleMaster(const CRGB& c, uint8_t masterBrightness) {
  CRGB out = c;
  out.nscale8_video(min<uint8_t>(masterBrightness, 255));
  return out;
}

void Renderer::fillStrip(CRGB* buf, uint16_t n, const CRGB& color) {
  for (uint16_t i = 0; i < n; i++) {
    buf[i] = color;
  }
}

void Renderer::setSlotPixel(ShelfState& state, const LedMapper& mapper, uint16_t slot1Based,
                            const CRGB& color) {
  StripId strip;
  uint16_t ix{};
  if (!mapper.mapSlot(slot1Based, strip, ix)) return;
  CRGB* buf = (strip == StripId::Odd) ? ledsOdd_ : ledsEven_;
  uint16_t n = (strip == StripId::Odd) ? oddCount_ : evenCount_;
  if (ix < n) {
    buf[ix] = color;
  }
}

void Renderer::renderBaseLayer(ShelfState& state, const LedMapper& mapper, uint32_t nowMs) {
  (void)nowMs;
  switch (state.mode) {
    case ShelfMode::BOOT:
    case ShelfMode::CLEAR:
      fillStrip(ledsOdd_, oddCount_, CRGB::Black);
      fillStrip(ledsEven_, evenCount_, CRGB::Black);
      break;

    case ShelfMode::IDLE: {
      const CRGB idle = state.settings.idleColor;
      const uint8_t scale =
          scale8(state.settings.idleScale == 0 ? 64 : state.settings.idleScale,
                 state.settings.brightness);
      const CRGB c = scaleMaster(idle, scale);
      fillStrip(ledsOdd_, oddCount_, c);
      fillStrip(ledsEven_, evenCount_, c);
      break;
    }

    case ShelfMode::SELECTED:
    case ShelfMode::BLINK_SLOT: {
      const CRGB bg = state.settings.idleColor;
      const uint8_t scale =
          scale8(state.settings.backgroundScale == 0 ? 40 : state.settings.backgroundScale,
                 state.settings.brightness);
      const CRGB c = scaleMaster(bg, scale);
      fillStrip(ledsOdd_, oddCount_, c);
      fillStrip(ledsEven_, evenCount_, c);
      break;
    }

    case ShelfMode::DEMO: {
      // Full-shelf rainbow — “premium retailer” sweep
      const uint8_t hueStart = state.effectPhase;
      uint16_t total = static_cast<uint16_t>(oddCount_ + evenCount_);
      if (total < 1) total = 1;
      for (uint16_t i = 0; i < oddCount_; i++) {
        const uint16_t pos = i;
        ledsOdd_[i] =
            CHSV(static_cast<uint8_t>(hueStart + (pos * 255u) / total), 255,
                 scale8(200, state.settings.brightness));
      }
      for (uint16_t i = 0; i < evenCount_; i++) {
        const uint16_t pos = static_cast<uint16_t>(oddCount_ + i);
        ledsEven_[i] =
            CHSV(static_cast<uint8_t>(hueStart + (pos * 255u) / total), 255,
                 scale8(200, state.settings.brightness));
      }
      break;
    }

    case ShelfMode::SELF_TEST:
      fillStrip(ledsOdd_, oddCount_, CRGB::Black);
      fillStrip(ledsEven_, evenCount_, CRGB::Black);
      break;

    case ShelfMode::PULSE:
    case ShelfMode::WAVE:
    case ShelfMode::PARTY:
    case ShelfMode::CLEANUP:
      // Reserved — fall through to soft idle until implemented
      fillStrip(ledsOdd_, oddCount_, scaleMaster(state.settings.idleColor, 40));
      fillStrip(ledsEven_, evenCount_, scaleMaster(state.settings.idleColor, 40));
      break;

    case ShelfMode::MUSIC_REACTIVE: {
      // Base dim shelf; overlay applied in renderMusicOverlay()
      const CRGB bg = state.settings.idleColor;
      const uint8_t scale =
          scale8(state.settings.backgroundScale == 0 ? 30 : state.settings.backgroundScale,
                 state.settings.brightness);
      fillStrip(ledsOdd_, oddCount_, scaleMaster(bg, scale));
      fillStrip(ledsEven_, evenCount_, scaleMaster(bg, scale));
      break;
    }
  }
}

void Renderer::renderHighlightLayer(ShelfState& state, const LedMapper& mapper) {
  const bool allowHighlight = (state.mode == ShelfMode::SELECTED) ||
                              (state.mode == ShelfMode::BLINK_SLOT) ||
                              (state.mode == ShelfMode::SELF_TEST) ||
                              (state.mode == ShelfMode::MUSIC_REACTIVE);

  if (!allowHighlight) return;

  auto paintOne = [&](uint16_t slot) {
    if (slot == 0 || !mapper.isValidSlot(slot)) return;
    CRGB hi = state.settings.selectedColor;
    hi.nscale8_video(state.settings.brightness);

    if (state.mode == ShelfMode::BLINK_SLOT && slot == state.selectedSlot &&
        !state.blinkHighlightVisible) {
      return;  // background shows through
    }

    if (state.mode == ShelfMode::SELF_TEST && slot == state.selectedSlot) {
      hi = CRGB::White;
      hi.nscale8_video(min<uint8_t>(255, (uint8_t)(state.settings.brightness + 32)));
    }

    setSlotPixel(state, mapper, slot, hi);
  };

  if (state.multiSlotCount > 0) {
    for (uint8_t i = 0; i < state.multiSlotCount; i++) {
      paintOne(state.multiSlots[i]);
    }
  } else {
    paintOne(state.selectedSlot);
  }
}

void Renderer::renderMusicOverlay(ShelfState& state, const LedMapper& mapper) {
  (void)mapper;
  if (!state.settings.musicReactiveEnabled) return;
  if (state.mode != ShelfMode::MUSIC_REACTIVE) return;

  const float norm = audio_->normalizedLoudness();  // 0..1 stub
  if (norm <= 0.01f) return;

  const uint8_t add = static_cast<uint8_t>(255.0f * norm);
  for (uint16_t i = 0; i < oddCount_; i++) {
    ledsOdd_[i] += CRGB(add / 4, 0, add / 2);
  }
  for (uint16_t i = 0; i < evenCount_; i++) {
    ledsEven_[i] += CRGB(add / 4, 0, add / 2);
  }
}

void Renderer::applyOddEvenMaster(const ShelfState& state) {
  // Additional uniform master curve if needed (placeholder)
  (void)state;
}

void Renderer::render(ShelfState& state, const LedMapper& mapper, uint32_t nowMs) {
  renderBaseLayer(state, mapper, nowMs);
  renderMusicOverlay(state, mapper);
  renderHighlightLayer(state, mapper);
  applyOddEvenMaster(state);
}
