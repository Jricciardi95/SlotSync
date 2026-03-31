/**
 * @file audio_input.h
 * @brief Microphone / audio front-end (stub MVP, structured for future I²S + FFT).
 *
 * Future work:
 *   I²S MEMS mic (e.g. SPH0645) → DMA circular buffer → ESP-DSP FFT
 *   Beat detection: onset envelope + debounce; frequency bands for “party” palette
 *   Calibration: ambient noise floor, automatic gain control in software
 */

#pragma once

#include <Arduino.h>

class AudioInput {
 public:
  void begin();
  /** Non-blocking sample + envelope follower each frame. */
  void update(uint32_t nowMs);

  /** 0..1 — smoothed “energy” for visualization (stub: slow sine for bring-up). */
  float normalizedLoudness() const { return normLoudness_; }

  uint16_t rawAdc() const { return lastAdc_; }

  void setSensitivity(uint8_t gain) { sensitivity_ = gain; }

  /** Placeholder for future beat tick (true for one loop after transient). */
  bool consumeBeatPulse();

 private:
  float normLoudness_{0};
  uint16_t lastAdc_{0};
  uint8_t sensitivity_{128};
  uint32_t lastMs_{0};
  bool beatPending_{false};

  void sampleAnalogStub(uint32_t nowMs);
};
