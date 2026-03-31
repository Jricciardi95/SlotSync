/**
 * @file serial_cli.h
 * @brief Interactive Serial command line for bench testing / manufacturing.
 */

#pragma once

#include "shelf_types.h"
#include "led_mapper.h"

void serialCliPoll(ShelfState& state, LedMapper& mapper);
