/**
 * @file audio_input.cpp
 */

#include "audio_input.h"
#include <hardware_config.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

void AudioInput::begin() {
  lastMs_ = millis();
  // Future: adcAttachPin(PIN_MIC_ANALOG_ADC); analogSetPinAttenuation(...)
  pinMode(PIN_MIC_ANALOG_ADC, INPUT);
}

void AudioInput::update(uint32_t nowMs) {
  sampleAnalogStub(nowMs);
  lastMs_ = nowMs;  // Future: Δt for envelope follower / RMS window
}

void AudioInput::sampleAnalogStub(uint32_t nowMs) {
  (void)nowMs;
  // Gentle synthetic motion so MUSIC_* modes are testable without hardware.
  const float t = static_cast<float>(nowMs) / 1000.0f;
  normLoudness_ =
      static_cast<float>(0.35 + 0.25 * sin((double)t * 2.3));  // ~0.1 .. 0.6
  normLoudness_ *= (0.5f + (sensitivity_ / 255.0f) * 0.5f);
  if (normLoudness_ < 0.f) normLoudness_ = 0.f;
  if (normLoudness_ > 1.f) normLoudness_ = 1.f;

  lastAdc_ = static_cast<uint16_t>(normLoudness_ * 4095.0f);
}

bool AudioInput::consumeBeatPulse() {
  if (!beatPending_) return false;
  beatPending_ = false;
  return true;
}
