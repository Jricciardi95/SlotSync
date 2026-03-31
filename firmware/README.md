# SlotSync — ESP32 shelf firmware (MVP)

**App HTTP contract (authoritative):** see [`APP_HTTP_CONTRACT.md`](./APP_HTTP_CONTRACT.md) — derived from `src/services/shelfApi/*.ts` in the React Native app.

Production-minded firmware for a dual **WS2812B** strip vinyl shelf. Odd slots use strip **A**; even slots use strip **B**. One logical **slot** maps to exactly one physical LED index (after calibration).

## Project layout

| Path | Responsibility |
|------|------------------|
| `include/hardware_config.h` | Pins, LED counts, timings, compile-time debug macros |
| `include/wifi_credentials.example.h` | Template for SSID/password (copy → `wifi_credentials.h`) |
| `src/shelf_types.h` | `ShelfMode`, `ShelfSettings`, `ShelfCalibration`, `ShelfState` |
| `src/led_mapper.cpp` | Slot → (`StripId`, index); max slot; reverse + offset |
| `src/renderer.cpp` | **Base → music overlay → highlight** compositing |
| `src/effects.cpp` | Non-blocking blink / demo hue / self-test slot walk |
| `src/audio_input.cpp` | Mic front-end **stub** (synthetic envelope for lab testing) |
| `src/persistence.cpp` | NVS load/save for colors, brightness, calibration |
| `src/serial_cli.cpp` | Interactive bench commands |
| `src/http_api.cpp` | JSON HTTP control plane for the mobile app |
| `src/main.cpp` | `setup()`, `loop()`, Wi-Fi maintenance |

## Build / flash

1. Install [PlatformIO](https://platformio.org/) (IDE extension or CLI).
2. Copy Wi-Fi secrets:

   ```bash
   cd firmware
   cp include/wifi_credentials.example.h include/wifi_credentials.h
   # edit SSID + password
   ```

3. Adjust `SHELF_LEDS_PER_ODD_STRIP`, `SHELF_LEDS_PER_EVEN_STRIP`, and data pins in `include/hardware_config.h`.
4. Build & upload:

   ```bash
   pio run -t upload
   pio device monitor
   ```

## Non-blocking loop

Each `loop()` tick runs: Wi-Fi maintenance → HTTP → Serial → audio stub → effects → **render** → `FastLED.show()`. Animations use `millis()` (no `delay()` on the hot path). A small `delay()` exists only in the **startup chase** inside `setup()`.

## HTTP API (JSON)

Base URL: `http://<device-ip>/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Health, mode, slot(s), colors, RSSI |
| GET | `/idle` | Ambient idle mode |
| GET | `/clear` | LEDs off |
| GET | `/demo` | Retail rainbow demo |
| GET | `/test` | Manufacturing self-test walk |
| GET | `/slot?num=N` | Select slot **N** (dim shelf + bright highlight) |
| GET | `/blink?num=N` | Blink highlight on slot **N** |
| GET | `/brightness?value=0-255` | Master curve |
| GET | `/idlecolor?r=&g=&b=` | Ambient RGB |
| GET | `/selectedcolor?r=&g=&b=` | Highlight RGB |
| GET | `/slots?nums=1,3,8` | **Bonus** — multi-slot highlight |

CORS: `Access-Control-Allow-Origin: *` (tighten for production).

## Serial CLI

`help` — lists `idle | clear | demo | test | status | slot N | slots 1,2 | blink N | brightness B | idlecolor R G B | selectedcolor R G B | music_on | music_off`.

## Evolution notes (as requested)

- **Music mode:** replace `AudioInput::sampleAnalogStub()` with I²S capture + RMS/FFT; drive `Renderer::renderMusicOverlay()` (keep **highlight last** so the selected record stays readable).
- **Persistence:** `persistence.cpp` already stores colors/brightness/calibration; extend with schema version + migration.
- **App integration:** call the HTTP endpoints from React Native; consider HTTPS via a gateway if leaving LAN.
- **Animations:** add modes (`PULSE`, `WAVE`, …) in `effects.cpp`; keep timing in `millis()`; pass parameters through `ShelfSettings.effectSpeed`.
- **Multi-slot:** `ShelfState::multiSlots[]` + `/slots` — extend highlight styles per slot if needed.
- **Multi-module shelves:** introduce `ShelfTopology { modules[]; baseSlotOffset }`; instantiate multiple `(odd,even)` buffer pairs or multiplex one virtual framebuffer; keep `LedMapper` mapping **global slot → (module, strip, index)**.

## Security / OTA (placeholders)

- **Auth:** add per-device token header or BLE pairing before accepting LAN writes.
- **OTA:** use ESP32 `ArduinoOTA` or HTTPS OTA partition; keep rollback story in mind.

## License

Match your SlotSync product license; not specified here.
