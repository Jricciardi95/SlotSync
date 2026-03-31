/**
 * @file persistence.cpp
 */

#include "persistence.h"
#include <hardware_config.h>
#include <Preferences.h>

namespace {
constexpr char kNs[] = "slotsync";
constexpr char kIdleR[] = "idR";
constexpr char kIdleG[] = "idG";
constexpr char kIdleB[] = "idB";
constexpr char kSelR[] = "slR";
constexpr char kSelG[] = "slG";
constexpr char kSelB[] = "slB";
constexpr char kBrightness[] = "br";
constexpr char kIdleScale[] = "idS";
constexpr char kBgScale[] = "bgS";
constexpr char kMicSens[] = "mic";
constexpr char kEffSpeed[] = "efx";

constexpr char kLedOdd[] = "lOdd";
constexpr char kLedEv[] = "lEv";
constexpr char kOffOdd[] = "oOdd";
constexpr char kOffEv[] = "oEv";
constexpr char kRevOdd[] = "rOdd";
constexpr char kRevEv[] = "rEv";
}  // namespace

void persistenceLoadCalibrationAndSettings(ShelfState& state) {
  // `state` already contains factory defaults for missing keys.
  Preferences p;
  if (!p.begin(kNs, true)) {
    return;
  }

  state.settings.idleColor.r = p.getUChar(kIdleR, state.settings.idleColor.r);
  state.settings.idleColor.g = p.getUChar(kIdleG, state.settings.idleColor.g);
  state.settings.idleColor.b = p.getUChar(kIdleB, state.settings.idleColor.b);

  state.settings.selectedColor.r = p.getUChar(kSelR, state.settings.selectedColor.r);
  state.settings.selectedColor.g = p.getUChar(kSelG, state.settings.selectedColor.g);
  state.settings.selectedColor.b = p.getUChar(kSelB, state.settings.selectedColor.b);

  state.settings.brightness = p.getUChar(kBrightness, state.settings.brightness);
  state.settings.idleScale = p.getUChar(kIdleScale, state.settings.idleScale);
  state.settings.backgroundScale = p.getUChar(kBgScale, state.settings.backgroundScale);
  state.settings.micSensitivity = p.getUChar(kMicSens, state.settings.micSensitivity);
  state.settings.effectSpeed = p.getUChar(kEffSpeed, state.settings.effectSpeed);

  state.calibration.ledsPerOddStrip =
      p.getUShort(kLedOdd, state.calibration.ledsPerOddStrip);
  state.calibration.ledsPerEvenStrip =
      p.getUShort(kLedEv, state.calibration.ledsPerEvenStrip);
  state.calibration.oddOffset =
      static_cast<int16_t>(p.getInt(kOffOdd, state.calibration.oddOffset));
  state.calibration.evenOffset =
      static_cast<int16_t>(p.getInt(kOffEv, state.calibration.evenOffset));
  state.calibration.reverseOddStrip = p.getBool(kRevOdd, state.calibration.reverseOddStrip);
  state.calibration.reverseEvenStrip = p.getBool(kRevEv, state.calibration.reverseEvenStrip);

  p.end();

  // Never allow NVS to reference more LEDs than the compiled FastLED buffers.
  if (state.calibration.ledsPerOddStrip > SHELF_LEDS_PER_ODD_STRIP) {
    state.calibration.ledsPerOddStrip = SHELF_LEDS_PER_ODD_STRIP;
  }
  if (state.calibration.ledsPerEvenStrip > SHELF_LEDS_PER_EVEN_STRIP) {
    state.calibration.ledsPerEvenStrip = SHELF_LEDS_PER_EVEN_STRIP;
  }
}

void persistenceSaveCalibrationAndSettings(const ShelfState& state) {
  Preferences p;
  if (!p.begin(kNs, false)) {
    return;
  }

  p.putUChar(kIdleR, state.settings.idleColor.r);
  p.putUChar(kIdleG, state.settings.idleColor.g);
  p.putUChar(kIdleB, state.settings.idleColor.b);

  p.putUChar(kSelR, state.settings.selectedColor.r);
  p.putUChar(kSelG, state.settings.selectedColor.g);
  p.putUChar(kSelB, state.settings.selectedColor.b);

  p.putUChar(kBrightness, state.settings.brightness);
  p.putUChar(kIdleScale, state.settings.idleScale);
  p.putUChar(kBgScale, state.settings.backgroundScale);
  p.putUChar(kMicSens, state.settings.micSensitivity);
  p.putUChar(kEffSpeed, state.settings.effectSpeed);

  p.putUShort(kLedOdd, state.calibration.ledsPerOddStrip);
  p.putUShort(kLedEv, state.calibration.ledsPerEvenStrip);
  p.putInt(kOffOdd, state.calibration.oddOffset);
  p.putInt(kOffEv, state.calibration.evenOffset);
  p.putBool(kRevOdd, state.calibration.reverseOddStrip);
  p.putBool(kRevEv, state.calibration.reverseEvenStrip);

  p.end();
}
