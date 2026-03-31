# SlotSync shelf — HTTP contract (from React Native app)

This document is **derived from the shipped client code**, not from comments:

- `src/services/shelfApi/shelfApi.ts` — paths, query param names, **GET only**
- `src/services/shelfApi/http.ts` — expects **HTTP 2xx**, body parses as **JSON**
- `src/services/shelfApi/types.ts` — **TypeScript shapes** (all fields optional on client)
- `src/services/ShelfLightingClient.ts` — **`/slots` when `allSlots.length > 1`**, else **`/slot`**

Firmware implementation: `firmware/src/http_api.cpp` + existing modular sources.

---

## Summary: final firmware API

| Method | Path | Query params | Success | Error |
|--------|------|--------------|---------|--------|
| GET | `/status` | — | 200 JSON | N/A |
| GET | `/idle` | — | 200 JSON | — |
| GET | `/clear` | — | 200 JSON | — |
| GET | `/demo` | — | 200 JSON | — |
| GET | `/test` | — | 200 JSON | *(app does not call; self-test mode)* |
| GET | `/slot` | **`num`** (uint, 1-based) | 200 JSON | 400 `{ "ok": false, "error": "invalid slot" }` |
| GET | `/slots` | **`nums`** (comma-separated, e.g. `1,2,5` — RN may URL-encode commas as `%2C`) | 200 JSON | 400 various `error` strings |
| GET | `/blink` | **`num`** | 200 JSON | 400 invalid slot |
| GET | `/brightness` | **`value`** (0–255) | 200 JSON | 400 invalid |
| GET | `/idlecolor` | **`r`**, **`g`**, **`b`** (0–255 each) | 200 JSON | 400 invalid rgb |
| GET | `/selectedcolor` | **`r`**, **`g`**, **`b`** | 200 JSON | 400 invalid rgb |
| *any* | unknown | — | — | 404 `{ "ok": false, "error": "not_found" }` |

**Headers:** responses set `Content-Type: application/json` and `Access-Control-Allow-Origin: *`.

**Multi-slot:** **Required** for album flows: app calls `GET /slots?nums=1%2C3` when multiple physical slots are assigned (`ShelfLightingClient.setSlotLight` with `allSlots`).

---

## JSON shapes the app accepts

### `GET /status` → `ShelfStatusJson`

Client uses **`mode`**, **`max_slot`** in UI alerts; other fields are for display / future use.

| Field | Type | Firmware supplies |
|-------|------|-------------------|
| `ok` | boolean | **yes** (`true`) |
| `mode` | string | yes (snake / lowercase mode id) |
| `selected_slot` | number | yes |
| `multi_count` | number | yes |
| `multi_slots` | number[] | yes |
| `max_slot` | number | yes |
| `brightness` | number | yes |
| `wifi_rssi` | number | yes |
| `wifi_ip` | string | yes |
| `uptime_ms` | number | yes |
| `idle` | `{ r, g, b }` | yes |
| `selected_color` | `{ r, g, b }` | yes |
| `music_reactive` | boolean | yes |
| `firmware` | string | yes |
| `error` | string | optional |

### Command responses → `ShelfOkJson`

| Field | When |
|-------|------|
| `ok` | `true` on success |
| `mode` | e.g. idle, clear, demo, blink |
| `slot` | `/slot`, `/blink` |
| `count` | `/slots` (multi count) |
| `brightness` | `/brightness` |
| `error` | error payloads |

**Errors:** Client treats **non-2xx** as failure; body may still be JSON with `ok: false` and `error`.

---

## Mismatches checked (app vs firmware)

| Item | Result |
|------|--------|
| `/slot?num=` vs path | **Match** |
| `/slots?nums=` | **Match** (`nums` comma list; URL-decoded by server) |
| `/brightness?value=` | **Match** |
| `/idlecolor` / `/selectedcolor` query `r,g,b` | **Match** |
| HTTP method | **GET only** — match |
| Status field names | **snake_case** — match (`selected_slot`, `max_slot`, `wifi_ip`, etc.) |
| `/status` `ok` | **Was missing**; firmware now sets **`ok: true`** for parity |

---

## Browser / curl tests (replace `IP`)

Base: `http://<ESP32_IP>` (no path suffix; app stores `http://192.168.x.x`)

```txt
http://192.168.1.50/status
http://192.168.1.50/idle
http://192.168.1.50/clear
http://192.168.1.50/demo
http://192.168.1.50/slot?num=12
http://192.168.1.50/slots?nums=1,3,5
http://192.168.1.50/blink?num=7
http://192.168.1.50/brightness?value=120
http://192.168.1.50/idlecolor?r=0&g=0&b=40
http://192.168.1.50/selectedcolor?r=255&g=255&b=255
```

```bash
curl -s "http://192.168.1.50/status" | jq .
curl -s "http://192.168.1.50/slot?num=3"
curl -s "http://192.168.1.50/slots?nums=1%2C2%2C3"
```

---

## Flash & validate checklist

1. **Hardware:** Common ground; 5 V sufficient for LEDs; data pins match `hardware_config.h` (`PIN_LED_ODD_STRIP`, `PIN_LED_EVEN_STRIP`); `SHELF_LEDS_PER_*` match install; `LED_COLOR_ORDER` (usually GRB for WS2812B).
2. **Wi-Fi:** Copy `include/wifi_credentials.example.h` → `include/wifi_credentials.h` with real SSID/password.
3. **Build/flash:** `pio run -t upload` then `pio device monitor` @ 115200.
4. **Serial:** Confirm `[wifi] connected` and IP; `[hw] LED odd GPIO…`; `Ready. Serial: type help`.
5. **Serial mapping:** Run `status` — confirm `map slot 1 -> …`, `max_slot`.
6. **HTTP:** From PC/phone on same LAN, open `/status` in browser; run `slot?num=1` and verify LED.
7. **Multi:** `slots?nums=1,2` — both slots highlight per renderer.
8. **App:** Settings → Smart shelf → save `http://<IP>` → Test connection; open an album with `RecordLocation.slotNumbers` — shelf should highlight.

---

## End-to-end (app → shelf)

1. User sets shelf base URL in app (AsyncStorage).
2. Opening **Record detail** with a location runs `highlightAlbumSlots` → `setSlotLight` with `allSlots` → **`GET /slots?nums=...`** if more than one slot, else **`GET /slot?num=...`**.
3. Firmware sets `SELECTED` mode, fills multi array, renderer draws dim base + bright slots.
