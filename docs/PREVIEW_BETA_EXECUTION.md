# Private beta — preview build execution guide

Step-by-step runbook for **EAS preview** builds (`eas build --profile preview`) and handing installs to testers.

---

## Part A — Preview build readiness audit (app repo)

### Blockers (fix or accept before testers use the app)

| Item | Why |
|------|-----|
| **`EXPO_PUBLIC_API_BASE_URL` not set at build time** | No valid URL candidates → startup resolution fails; first API use can throw (`getApiBaseUrl`). Set via EAS Secrets or `eas.json` `env` for the preview profile. |
| **HTTPS staging down or unreachable from testers’ networks** | Parallel health checks all fail → same as above. |
| **Server enforces `SLOTSYNC_API_KEY` but app build omits `EXPO_PUBLIC_SLOTSYNC_API_KEY`** | All `/api/*` return **401** → identify, metadata proxy, ping fail. |
| **Apple / Google distribution** | Internal iOS needs devices / TestFlight / ad hoc; Android APK still needs install path. Not fixable in repo. |

### Strong recommendations

| Item | Why |
|------|-----|
| **`EXPO_PUBLIC_SENTRY_DSN` on preview** | Crash visibility for real devices; `__DEV__` is false → Sentry runs when DSN is set. |
| **HTTPS for staging API** | Testers on cellular or strict Wi‑Fi; HTTP-only staging often fails or is fragile. |
| **Smoke-test URLs before build** (below) | Catches TLS, key mismatch, and firewall issues early. |
| **Document for testers: shelf is optional** | Reduces “broken app” reports when they have no ESP32 (Settings → Smart shelf explains this in-app). |

### Can wait (public / scale)

- Per-user auth, non-extractable API secrets, cert pinning, WAF, App Store compliance polish.
- Cloud-accessible shelf / tunneling.

---

## Part B — Backend: minimum for a meaningful beta

### Endpoints the app uses (non-shelf)

| Method | Path | Needed for |
|--------|------|------------|
| GET | `/health` | URL resolution, orchestrator preflight |
| GET | `/api/ping` | Optional connectivity check in identification service |
| POST | `/api/identify-record` | **Core** — photo + barcode identify |
| POST | `/api/identify-by-text` | Manual / text lookup |
| GET | `/api/discogs/release/:id` | CSV import, Discogs-backed flows |
| GET | `/api/metadata/discogs/search` | Metadata search in app |
| GET | `/api/metadata/musicbrainz/*` | MusicBrainz-backed metadata |
| GET | `/api/metadata/caa/release/:mbid` | Cover art via CAA proxy |

### Minimum server-side services

| Service | If missing |
|---------|------------|
| **Node hybrid server** (`server-hybrid.js` or equivalent) | Nothing works against your API. |
| **Discogs token** (`DISCOGS_PERSONAL_ACCESS_TOKEN` or key/secret) | Identification and Discogs routes degrade or error. |
| **Google Vision** (optional) | Image/OCR path weaker; barcode + text paths may still work depending on pipeline. |
| **Embeddings / vector index** (if wired) | May fall back to non-embedding matching — confirm behavior on your branch. |

**Shelf (ESP32)** is **not** on this list. It is LAN-only and separate from staging HTTPS.

### Feature degradation matrix (typical)

| Missing piece | User-visible effect |
|---------------|---------------------|
| No backend / bad URL | App may open; identify and metadata fail; errors about unreachable API. |
| API key mismatch | 401-style failures on all `/api/*`. |
| Discogs down / token invalid | Identify suggestions empty or errors from Discogs steps. |
| No Vision | Some cover scans less accurate or slower fallback paths. |
| No shelf / wrong LAN | LEDs do not change; **library and scan still work** if API is fine. |

---

## Part C — Foolproof preview setup (you do this in order)

### 1. Staging server

1. Deploy backend with TLS (reverse proxy or host TLS).
2. Set **`DISCOGS_PERSONAL_ACCESS_TOKEN`** (required for meaningful ID).
3. Set **`SLOTSYNC_API_KEY`** to a long random string (recommended for beta).
4. Optional: **`GOOGLE_APPLICATION_CREDENTIALS`** for Vision.

### 2. EAS environment (Expo dashboard → Secrets, or `eas secret:create`)

Use the **same** names the app reads at build time (`EXPO_PUBLIC_*` are inlined into the JS bundle).

| Name | Required | Example |
|------|----------|---------|
| `EXPO_PUBLIC_API_BASE_URL` | **Yes** | `https://api-staging.yourdomain.com` (no trailing slash) |
| `EXPO_PUBLIC_SLOTSYNC_API_KEY` | Yes if server sets `SLOTSYNC_API_KEY` | Same string as server |
| `EXPO_PUBLIC_SENTRY_DSN` | Recommended | From Sentry project (React Native) |
| `EXPO_PUBLIC_APP_ENV` | Optional | Already `preview` in `eas.json` for that profile |

`EXPO_PUBLIC_SHELF_BASE_URL` is optional (per-tester LAN IP is usually set in **Settings → Smart shelf**).

### 3. Manual URL tests (from your laptop, before `eas build`)

Replace `HOST` and `KEY`:

```bash
curl -sS "https://HOST/health"

curl -sS -H "X-SlotSync-Api-Key: KEY" "https://HOST/api/ping"

curl -sS -H "X-SlotSync-Api-Key: KEY" \
  "https://HOST/api/metadata/discogs/search?q=test&per_page=1"
```

Expect HTTP 200 and JSON bodies (exact shape may vary). If `/health` fails, fix deployment/TLS first.

### 4. Build commands

```bash
cd /path/to/SlotSync
eas login
eas whoami
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

Install the artifacts via your chosen internal distribution flow.

---

## Part D — Shelf behavior in private beta

- **LAN-only is acceptable** for a small beta if you set expectations: same Wi‑Fi as ESP32, static or DHCP-reserved IP helps.
- **UX when shelf is missing or wrong network**: LED actions fail silently (e.g. auto-highlight) or show a short alert; **core catalog and identification are independent**.
- **In-app**: Settings → Smart shelf includes a short “private beta note” so testers know the shelf is optional.

---

## Part E — Tester smoke-test checklist (copy/paste)

**Prereq:** Tester has installable preview build; you gave them staging is up and (if used) API key is baked in.

### 1. App launch

- [ ] App opens without immediate crash.
- [ ] No endless spinner (if stuck >15s, likely API URL/health — retry on good Wi‑Fi).

### 2. Sign-in / startup

- [ ] There is **no** user sign-in for SlotSync today; nothing to test here.

### 3. Record identification

- [ ] Open add/scan flow; take or pick a clear album cover photo; run identify.
- [ ] If available, scan a barcode; confirm a result or sensible “not found.”

### 4. Metadata fetching

- [ ] From library or add flow, trigger a Discogs/metadata lookup (search or detail).
- [ ] Confirm cover or metadata loads, or a clear error (not a silent hang).

### 5. Shelf connection

- [ ] Settings → Smart shelf: enter ESP32 IP (same Wi‑Fi); Save → **Test connection**.
- [ ] If no hardware: skip; confirm library and scan still work.

### 6. Album → shelf lighting

- [ ] With shelf connected: open an album tied to a slot; confirm LEDs update (if auto-highlight on).
- [ ] Turn off “Auto-light shelf when opening an album”; open album — expect no auto LED change.

### 7. Offline / failure

- [ ] Enable airplane mode; try identify — expect network error, app still responsive.
- [ ] Disable airplane mode; retry — expect recovery without reinstall.

**Report template for testers:** device (iOS/Android + version), Wi‑Fi vs cellular, screenshot of error text, approximate time (UTC).

---

## Part F — Repo behavior notes (preview profile)

- **`EXPO_PUBLIC_APP_ENV=preview`**: API base URL candidates are ordered **EAS `extra` → `process.env` → hostUri** so staging HTTPS wins over accidental Expo host inference.
- **`/health`** is called without the API key (by design).
- **All `/api/*`** should go through `apiFetch` so `X-SlotSync-Api-Key` is attached when configured.

See also: [STAGING_CHECKLIST.md](./STAGING_CHECKLIST.md), [PRIVATE_BETA_GATE.md](./PRIVATE_BETA_GATE.md).
