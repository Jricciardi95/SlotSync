# Minimal staging deployment checklist

Use this for a **private beta** backend reachable over **HTTPS** from TestFlight / internal APK builds.

**Full beta runbook** (EAS secrets, commands, tester smoke tests, audit tables): [PREVIEW_BETA_EXECUTION.md](./PREVIEW_BETA_EXECUTION.md).

## Endpoints the mobile app calls (non-shelf)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | URL resolution / connectivity; **no** API key (plain `fetch`) |
| GET | `/api/ping` | Connectivity test |
| POST | `/api/identify-record` | Image + JSON barcode body; **rate-limited** |
| POST | `/api/identify-by-text` | Text lookup |
| GET | `/api/discogs/release/:id` | CSV / metadata flows |
| GET | `/api/metadata/discogs/search` | Metadata client |
| GET | `/api/metadata/musicbrainz/*` | Metadata client |
| GET | `/api/metadata/caa/release/:mbid` | Cover art proxy |

**Shelf / ESP32** traffic is separate (`EXPO_PUBLIC_SHELF_BASE_URL` or in-app settings). It is intentionally LAN-only and not part of this staging API.

## Server environment

1. Deploy `backend-example/server-hybrid.js` (or your equivalent) behind TLS termination (reverse proxy, PaaS, etc.).
2. Set **`DISCOGS_PERSONAL_ACCESS_TOKEN`** (or key/secret) and optional **`GOOGLE_APPLICATION_CREDENTIALS`** for Vision.
3. **Private beta gate:** set **`SLOTSYNC_API_KEY`** to a long random string. When set, every `/api/*` request must send **`X-SlotSync-Api-Key`** or **`Authorization: Bearer <key>`** (the app uses `apiFetch`, which adds the header from `EXPO_PUBLIC_SLOTSYNC_API_KEY`).
4. Optional tuning: **`API_RATE_LIMIT_MAX`**, **`IDENTIFY_RATE_LIMIT_MAX`** (see `backend-example/.env.example`).
5. **`GET https://<host>/health`** returns JSON with `ok` (or your existing health shape). **`GET /api/ping`** should work with the API key if enforcement is on.

## EAS preview app (match the server)

Set project secrets or `eas.json` `env` for the **preview** profile:

- `EXPO_PUBLIC_API_BASE_URL=https://<your-staging-host>` (no trailing slash)
- `EXPO_PUBLIC_SLOTSYNC_API_KEY=<same value as SLOTSYNC_API_KEY>` (required if the server enforces the key)
- `EXPO_PUBLIC_SENTRY_DSN=...` (recommended for beta crash visibility)

Then:

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

## Smoke test (from your laptop)

```bash
curl -sS "https://<host>/health"
curl -sS -H "X-SlotSync-Api-Key: $KEY" "https://<host>/api/ping"
```
