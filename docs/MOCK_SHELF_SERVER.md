# Mock Shelf Server (Local ESP32 Emulator)

Use this to test shelf LED behavior before physical hardware exists.

## Start it

```bash
npm run mock:shelf
```

Default URL: `http://localhost:8787`  
Visual UI: `http://localhost:8787/visual`

## Quick health check (one command)

After starting the server, run:

```bash
npm run test:mock-shelf
```

It checks:

- server reachable
- `/status`
- `/slot?num=1`
- `/slot?num=2`
- `/slot?num=12`
- `/blink?num=12`
- `/slots?nums=1,3,5`
- `/brightness?value=120`

Outputs clear `PASS` / `FAIL` lines and tells you if the server is not running.

Optional custom URL:

```bash
MOCK_SHELF_BASE_URL=http://127.0.0.1:8787 npm run test:mock-shelf
```

## Routes implemented

- `GET /status`
- `GET /idle`
- `GET /clear`
- `GET /demo`
- `GET /slot?num=12`
- `GET /slots?nums=1,3,5`
- `GET /blink?num=12`
- `GET /brightness?value=120`
- `GET /idlecolor?r=0&g=0&b=30`
- `GET /selectedcolor?r=255&g=255&b=255`

JSON shape follows the app's `ShelfStatusJson` / `ShelfOkJson` expectations.

## Logical mapping behavior

The server logs shelf slot mapping on each slot/blink command:

- odd slots -> odd strip
- even slots -> even strip
- slot 1 -> odd strip LED 0
- slot 2 -> even strip LED 0
- slot 12 -> even strip LED 5

## Config (env vars)

- `MOCK_SHELF_PORT` (default `8787`)
- `MOCK_SHELF_ODD_LED_COUNT` (default `30`)
- `MOCK_SHELF_EVEN_LED_COUNT` (default `30`)
- `MOCK_SHELF_REVERSE_ODD` (`true`/`false`, default `false`)
- `MOCK_SHELF_REVERSE_EVEN` (`true`/`false`, default `false`)
- `MOCK_SHELF_ODD_OFFSET` (default `0`)
- `MOCK_SHELF_EVEN_OFFSET` (default `0`)

Example:

```bash
MOCK_SHELF_ODD_LED_COUNT=24 \
MOCK_SHELF_EVEN_LED_COUNT=24 \
MOCK_SHELF_REVERSE_ODD=true \
npm run mock:shelf
```

## Point the app to the mock server

### iOS simulator (same machine)

In app Settings -> Smart shelf, set:

`http://localhost:8787`

### Android emulator

Use:

`http://10.0.2.2:8787`

### Physical phone on same Wi-Fi

Use your computer LAN IP:

`http://<YOUR_LAN_IP>:8787`

Then run through `Light Slot` and `Find on Shelf (Blink)` in `Record Detail`.
