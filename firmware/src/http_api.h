/**
 * @file http_api.h
 * @brief Lightweight HTTP control plane for mobile app integration.
 *
 * Security note (MVP): no authentication. For production, add TLS reverse proxy,
 * rotating device token, or WPA3 Enterprise / BLE pairing before exposing LAN API.
 */

#pragma once

#include "led_mapper.h"
#include "shelf_types.h"

/** Call after Wi-Fi is connected. */
bool httpApiBegin(ShelfState& state, LedMapper& mapper);

/** Poll each loop (non-blocking). */
void httpApiPoll();
