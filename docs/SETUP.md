# SlotSync setup

This guide covers running the **Expo app**, the **identification backend**, and optional **ESP32 shelf** hardware.

## Prerequisites

- **Node.js** (LTS) and npm
- **Xcode** (iOS simulator / device) and/or **Android Studio** as needed
- For the backend: **Google Cloud** credentials if you use Vision features (see `backend-example/GOOGLE_VISION_SETUP.md`)

## 1. Mobile app (Expo)

From the repo root:

```bash
npm install
npx expo start
```

### Point the app at your backend

The app resolves the API base URL from `src/config/api.ts` (dev helpers, persisted URL, env). For a phone on the same LAN as your Mac, use your Mac’s IP (not `localhost`).

Optional: set `EXPO_PUBLIC_API_BASE_URL` in `.env` or `app.json` `extra` if your project is wired for it.

### Smart shelf URL (optional)

In the app: **Settings → Smart shelf** (persisted), or build-time `EXPO_PUBLIC_SHELF_BASE_URL`. If unset, lighting calls may fall back to the `ipAddress` stored on the **Unit** row in the local database.

## 2. Backend (hybrid identification server)

```bash
cd backend-example
npm install
cp .env.example .env   # then edit with keys as needed
node server-hybrid.js
# or: ./start-server.sh
```

Confirm health (adjust host/port):

```bash
curl -s http://127.0.0.1:3000/health
```

## 3. ESP32 shelf firmware (optional)

See `firmware/README.md` and `firmware/APP_HTTP_CONTRACT.md` (or the doc alongside your PlatformIO project).

1. Copy Wi‑Fi credentials from the example header into `firmware/include/wifi_credentials.h` (or your project’s equivalent).
2. Build and flash with **PlatformIO**.
3. Note the device IP (serial or router).
4. In the app, set the shelf base URL to `http://<esp32-ip>` (or set the Unit’s `ipAddress` in app data if you use that fallback).

## Happy path

1. Start the backend; verify `/health`.
2. Start Expo; set API URL so the device can reach the backend.
3. Open **Scan record**, capture a cover; confirm a match or suggestions.
4. Open **Virtual shelf** for a unit; assign a record to a slot and confirm the strip highlights (if firmware is running).

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| App cannot reach API | Same Wi‑Fi; firewall; use LAN IP, not `localhost`, on a physical device. |
| Timeouts | Backend logs; `curl` health; increase timeouts only after confirming network. |
| Shelf does nothing | Shelf URL / unit IP; firmware serial logs; `GET /status` on the ESP32 from a browser or `curl`. |
| Vision / Discogs errors | `backend-example` `.env` and the Vision / Discogs setup docs. |
