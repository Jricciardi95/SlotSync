/**
 * @file led_mapper.h
 * @brief Slot ↔ physical LED index mapping for dual odd/even strips.
 */

#pragma once

#include "shelf_types.h"

enum class StripId : uint8_t { Odd = 0, Even = 1 };

class LedMapper {
 public:
  /** Sensible defaults from hardware_config.h (factory bring-up). */
  LedMapper();
  explicit LedMapper(const ShelfCalibration& cal);

  void setCalibration(const ShelfCalibration& cal);

  /** Largest slot number (1-based) that fits current calibration. */
  uint16_t maxSlotCount() const { return maxSlots_; }

  bool isValidSlot(uint16_t slot1Based) const {
    return slot1Based >= 1 && slot1Based <= maxSlots_;
  }

  /**
   * Map vinyl record slot (1-based) to strip + LED index in FastLED buffer order.
   * Returns false if out of range for calibration.
   */
  bool mapSlot(uint16_t slot1Based, StripId& strip, uint16_t& ledIndex) const;

 private:
  ShelfCalibration cal_{};
  uint16_t maxSlots_{0};
  void recomputeMaxSlots();
};
