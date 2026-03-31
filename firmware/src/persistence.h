/**
 * @file persistence.h
 * @brief NVS (Preferences) adapter — settings survive power cycle.
 *
 * Future: versioning, migration, per-shelf module ID, factory reset command.
 */

#pragma once

#include "shelf_types.h"

/** Load into state.settings + calibration subset; do not change mode/selection. */
void persistenceLoadCalibrationAndSettings(ShelfState& state);

/** Persist user settings + calibration (compact). */
void persistenceSaveCalibrationAndSettings(const ShelfState& state);
