/**
 * @file led_mapper.cpp
 */

#include "led_mapper.h"
#include <hardware_config.h>

LedMapper::LedMapper() {
  ShelfCalibration c{};
  c.ledsPerOddStrip = SHELF_LEDS_PER_ODD_STRIP;
  c.ledsPerEvenStrip = SHELF_LEDS_PER_EVEN_STRIP;
  c.oddOffset = 0;
  c.evenOffset = 0;
  c.reverseOddStrip = false;
  c.reverseEvenStrip = false;
  setCalibration(c);
}

LedMapper::LedMapper(const ShelfCalibration& cal) { setCalibration(cal); }

void LedMapper::setCalibration(const ShelfCalibration& cal) {
  cal_ = cal;
  if (cal_.ledsPerOddStrip == 0) cal_.ledsPerOddStrip = 1;
  if (cal_.ledsPerEvenStrip == 0) cal_.ledsPerEvenStrip = 1;
  recomputeMaxSlots();
}

void LedMapper::recomputeMaxSlots() {
  maxSlots_ = 0;
  // Brute-force is robust to arbitrary offsets / reverse flags.
  for (uint16_t slot = 1; slot < 2048; slot++) {
    StripId strip;
    uint16_t idx{};
    if (!mapSlot(slot, strip, idx)) break;
    maxSlots_ = slot;
  }
}

bool LedMapper::mapSlot(uint16_t slot1Based, StripId& strip, uint16_t& ledIndex) const {
  if (slot1Based == 0) return false;

  strip = ((slot1Based & 1u) == 1u) ? StripId::Odd : StripId::Even;
  const uint16_t ledsOnStrip =
      (strip == StripId::Odd) ? cal_.ledsPerOddStrip : cal_.ledsPerEvenStrip;
  const int16_t offset = (strip == StripId::Odd) ? cal_.oddOffset : cal_.evenOffset;
  const bool reverse =
      (strip == StripId::Odd) ? cal_.reverseOddStrip : cal_.reverseEvenStrip;

  // Unified logical index along the shelf for both strips:
  // slot 1 -> 0, slot 2 -> 0, slot 3 -> 1, slot 4 -> 1, ...
  const uint16_t logicalAlongStrip = (slot1Based - 1u) / 2u;

  int32_t physical = static_cast<int32_t>(logicalAlongStrip) + static_cast<int32_t>(offset);

  if (physical < 0 || physical >= static_cast<int32_t>(ledsOnStrip)) {
    return false;
  }

  if (reverse) {
    physical = static_cast<int32_t>(ledsOnStrip) - 1 - physical;
  }

  if (physical < 0 || physical >= static_cast<int32_t>(ledsOnStrip)) {
    return false;
  }

  ledIndex = static_cast<uint16_t>(physical);
  return true;
}
