/**
 * @file shelf_strings.h
 * @brief Stable string labels for modes (API + Serial + logs).
 */

#pragma once

#include "shelf_types.h"

inline const char* shelfModeToString(ShelfMode m) {
  switch (m) {
    case ShelfMode::BOOT:
      return "boot";
    case ShelfMode::IDLE:
      return "idle";
    case ShelfMode::SELECTED:
      return "selected";
    case ShelfMode::CLEAR:
      return "clear";
    case ShelfMode::DEMO:
      return "demo";
    case ShelfMode::SELF_TEST:
      return "selftest";
    case ShelfMode::BLINK_SLOT:
      return "blink";
    case ShelfMode::PULSE:
      return "pulse";
    case ShelfMode::WAVE:
      return "wave";
    case ShelfMode::PARTY:
      return "party";
    case ShelfMode::CLEANUP:
      return "cleanup";
    case ShelfMode::MUSIC_REACTIVE:
      return "music";
    default:
      return "unknown";
  }
}
