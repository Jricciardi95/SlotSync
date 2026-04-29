# Beta launch — what’s done and what to run

## Environment: what lives where

| Variable | In repo? | Where to set |
|----------|----------|----------------|
| `EXPO_PUBLIC_APP_ENV` | No secret value | `eas.json` → `build.*.env` (already `development` / `preview` / `production`) |
| `EXPO_PUBLIC_API_BASE_URL` | **Never commit LAN IPs** | **Local:** `.env` (see `.env.example`). **EAS:** Project secrets or profile `env` |
| `EXPO_PUBLIC_SHELF_BASE_URL` | Optional | Same pattern; most users use Settings → Shelf connection instead |
| `EXPO_PUBLIC_SENTRY_DSN` | **Never commit** | EAS Secret or profile `env` for `preview` + `production` |

`app.config.js` merges `process.env` over `app.json` `extra` at prebuild time. Production store builds should get **HTTPS** API URLs from EAS.

### EAS commands (examples)

```bash
# API (preview/staging)
eas secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value "https://api-staging.yourdomain.com" --type string

# Sentry (release builds only; __DEV__ still skips SDK init)
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "https://...@....ingest.sentry.io/..." --type string
```

For a one-off preview build without secrets UI:

```json
"preview": {
  "env": {
    "EXPO_PUBLIC_APP_ENV": "preview",
    "EXPO_PUBLIC_API_BASE_URL": "https://your-staging-url"
  }
}
```

(Do not commit real URLs if the repo is public.)

---

## Sentry setup (minimal)

1. Create a **React Native** project in Sentry; copy the **DSN**.
2. Add `EXPO_PUBLIC_SENTRY_DSN` via EAS secret (see above).
3. Rebuild native binaries (`eas build`) after adding the plugin — `@sentry/react-native` is already in `app.json` plugins.
4. During `eas build`, you may see a note about `organization` / `project` for **source maps**; optional: set `SENTRY_AUTH_TOKEN` per [Expo + Sentry](https://docs.expo.dev/guides/using-sentry/). Crashes still work with DSN only.

Runtime: `initMonitoring()` in `App.tsx` initializes Sentry **only when not `__DEV__`** and DSN is present. `logger.captureException` forwards to Sentry in those builds.

---

## Build checklist

- [ ] Apple Developer + Google Play accounts; bundle IDs `com.slotsync.app` (change if you don’t own the name).
- [ ] `eas login` && `eas build:configure` (once).
- [ ] Preview: `eas build --profile preview --platform ios` (and/or Android).
- [ ] Production: `eas build --profile production --platform all`.
- [ ] Sentry DSN on preview/production profiles.
- [ ] HTTPS API URL for anything you ship off your LAN.

### Still missing for a **first real** preview IPA/AAB

- Icons/splash are defaults — fine for internal beta; replace for store.
- `eas.json` `submit.production` — fill Apple / Play credentials when submitting.
- Sentry org/project env vars if you want **source maps** (optional).
- Privacy policy URL + support email for external testers.

---

## Backend: beta vs public

**Private beta (10–50 users)**  
- Hosted HTTPS API with `/health` and `/api/identify-record` (and metadata proxy routes the app calls).  
- **Strongly recommended:** basic rate limiting + API key or install token so the URL isn’t anonymously abused.  
- Uptime check on `/health`.

**Public launch**  
- Auth tied to accounts or signed app tokens, stricter rate limits, monitoring (5xx, latency, Vision/Discogs errors), cost alerts.

---

## Permissions (current)

- **Camera** — scan covers / barcodes (`expo-camera`; mic disabled on Android).
- **Local network (iOS)** — shelf ESP32 (`NSLocalNetworkUsageDescription`).
- **Cleartext (Android)** — allowed for LAN shelf + dev API; production API should be **HTTPS** to reduce review friction.
- **Photo library** — used where `expo-image-picker` / document flows apply; ensure App Store “Photo Library” usage string is present if Apple asks (Expo may add when plugin configured).

---

## Launch sequence summary

| Phase | Complete when |
|-------|----------------|
| **Now (this pass)** | `app.config.js`, no default LAN API in repo, production skips hostUri inference, Sentry wired (DSN-gated), shelf UX strings + auto-highlight toggle, logging routed through `logger`, `.env.example`, this doc. |
| **Private beta** | HTTPS staging API + EAS preview builds + Sentry DSN + 10–50 testers + minimal privacy/support links. |
| **Public** | Production API + auth/rate limits + store listing + remove reliance on cleartext for primary API. |

### Next 3 highest-value steps

1. **Deploy staging API (HTTPS)** and set `EXPO_PUBLIC_API_BASE_URL` on the **preview** EAS profile.  
2. **Create EAS secret** for `EXPO_PUBLIC_SENTRY_DSN` and run **`eas build --profile preview`**.  
3. **Add API key / rate limit** on `POST /api/identify-record` before sharing the URL widely.
