/**
 * @file renderer.h
 * @brief Composes LED output using a layered mental model (base → highlight → effects).
 *
 * MVP pipeline:
 *   1) Base layer — ambient / off / demo background
 *   2) Highlight layer — selected slot(s), respecting blink visibility
 *   3) Effect overlay — reserved hook for music; demo uses base as full-frame hue sweep
 *
 * Future: split applyMusicOverlay() and keep highlight composited last for legibility.
 */

#pragma once

#include <FastLED.h>
#include "led_mapper.h"
#include "shelf_types.h"

class AudioInput;

class Renderer {
 public:
  Renderer(CRGB* ledsOdd, uint16_t oddCount, CRGB* ledsEven, uint16_t evenCount,
            AudioInput& audio);

  void render(ShelfState& state, const LedMapper& mapper, uint32_t nowMs);

 private:
  CRGB* ledsOdd_{nullptr};
  CRGB* ledsEven_{nullptr};
  uint16_t oddCount_{0};
  uint16_t evenCount_{0};
  AudioInput* audio_{nullptr};

  static CRGB scaleMaster(const CRGB& c, uint8_t masterBrightness);
  static void fillStrip(CRGB* buf, uint16_t n, const CRGB& color);

  void renderBaseLayer(ShelfState& state, const LedMapper& mapper, uint32_t nowMs);
  void renderHighlightLayer(ShelfState& state, const LedMapper& mapper);
  void renderMusicOverlay(ShelfState& state, const LedMapper& mapper);

  void setSlotPixel(ShelfState& state, const LedMapper& mapper, uint16_t slot1Based,
                    const CRGB& color);
  void applyOddEvenMaster(const ShelfState& state);
};
