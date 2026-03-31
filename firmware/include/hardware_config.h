/**
 * @file hardware_config.h
 * @brief Compile-time hardware / tuning constants for SlotSync shelf firmware.
 *
 * Adjust pins and LED counts here for each PCB / shelf variant.
 * Runtime calibration (reverse, offsets) lives in ShelfCalibration (shelf_types.h).
 */

#pragma once

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Build-time diagnostics
// ---------------------------------------------------------------------------
#ifndef VERBOSE_DEBUG
#define VERBOSE_DEBUG 0
#endif

/** Log every HTTP API request to Serial (matches SlotSync app contract debugging). */
#ifndef SHELF_HTTP_REQUEST_LOG
#define SHELF_HTTP_REQUEST_LOG 1
#endif

#if VERBOSE_DEBUG
#define DBG_PRINT(x) Serial.print(x)
#define DBG_PRINTLN(x) Serial.println(x)
#else
#define DBG_PRINT(x)
#define DBG_PRINTLN(x)
#endif

// ---------------------------------------------------------------------------
// LED data pins (WS2812B)
// ---------------------------------------------------------------------------
#ifndef PIN_LED_ODD_STRIP
#define PIN_LED_ODD_STRIP 5
#endif
#ifndef PIN_LED_EVEN_STRIP
#define PIN_LED_EVEN_STRIP 18
#endif

// ---------------------------------------------------------------------------
// LED configuration
// ---------------------------------------------------------------------------
#ifndef SHELF_LEDS_PER_ODD_STRIP
#define SHELF_LEDS_PER_ODD_STRIP 60
#endif
#ifndef SHELF_LEDS_PER_EVEN_STRIP
#define SHELF_LEDS_PER_EVEN_STRIP 60
#endif

#ifndef LED_COLOR_ORDER
#define LED_COLOR_ORDER GRB
#endif

// WS2812 @ 800kHz — pick a reasonable power budget; tweak per supply
#ifndef FASTLED_REF_CLOCK_MHZ
#define FASTLED_REF_CLOCK_MHZ 80
#endif

// ---------------------------------------------------------------------------
// Analog front-end (future I²S / ADC microphone)
// ---------------------------------------------------------------------------
#ifndef PIN_MIC_ANALOG_ADC
#define PIN_MIC_ANALOG_ADC 34  // GPIO34 = ADC1_CH6 (input-only on many ESP32)
#endif

// ---------------------------------------------------------------------------
// Wi-Fi / HTTP
// ---------------------------------------------------------------------------
#ifndef WIFI_CONNECT_TIMEOUT_MS
#define WIFI_CONNECT_TIMEOUT_MS 20000
#endif
#ifndef WIFI_RECONNECT_INTERVAL_MS
#define WIFI_RECONNECT_INTERVAL_MS 30000
#endif

// ---------------------------------------------------------------------------
// Animation timing (non-blocking, millis-based)
// ---------------------------------------------------------------------------
#ifndef DEMO_HUE_CYCLE_MS
#define DEMO_HUE_CYCLE_MS 20000
#endif
#ifndef BLINK_HALF_PERIOD_MS
#define BLINK_HALF_PERIOD_MS 400
#endif
#ifndef STARTUP_CHASE_STEP_MS
#define STARTUP_CHASE_STEP_MS 22
#endif

// ---------------------------------------------------------------------------
// OTA / security — placeholders (no implementation in MVP)
// ---------------------------------------------------------------------------
// Future: HTTP auth token, device pairing nonce, HTTPS + certs, etc.
