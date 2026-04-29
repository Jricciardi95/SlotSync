# Private beta gate review

Opinionated split for **10–50 testers**, **real devices**, **core identify + library** experience — not App Store scale.

## Beta-ready (with your manual steps)

- **HTTPS staging API** wired via `EXPO_PUBLIC_API_BASE_URL`; app uses **`apiFetch`** for all `/api/*` calls with optional **`X-SlotSync-Api-Key`**.
- **`/health`** stays unauthenticated for simple reachability checks (intentional).
- **Rate limits** on `/api/*` and stricter limits on **`/api/identify-record`** (tunable env vars).
- **Sentry**: `@sentry/react-native` plugin in `app.json`, **`initMonitoring()`** at app load, root wrapped with **`Sentry.wrap`**. Set **`EXPO_PUBLIC_SENTRY_DSN`** on preview builds for crash reporting.
- **EAS preview profile** exists in `eas.json` (`EXPO_PUBLIC_APP_ENV=preview`).

## Blockers for private beta (must be true before handing builds out)

1. A **reachable HTTPS** deployment of the hybrid server with **Discogs** (and Vision if you promise image ID).
2. **Matching secrets**: `SLOTSYNC_API_KEY` on server ↔ `EXPO_PUBLIC_SLOTSYNC_API_KEY` in EAS (if you enable enforcement — **recommended** once staging is live).
3. **EAS secrets** for preview: at minimum **`EXPO_PUBLIC_API_BASE_URL`**; add DSN and API key as above.
4. **Install path**: Apple **internal distribution** / TestFlight-style flow and/or **Android APK** from EAS — you still need accounts, devices registered if using ad hoc, etc. (operational, not repo).

## Not blockers yet (defer to public launch)

- **Per-user auth** and non-extractable API credentials (the shared app key is extractable from the binary — acceptable only for a closed beta).
- **Certificate pinning**, WAF, geo rules, advanced bot defense.
- **Per-tenant billing**, abuse desks, formal SLA.
- **Stripping `usesCleartextTraffic` / local networking** flags — needed for store hardening later; LAN shelf + dev still benefit from current Android/iOS network allowances.

## Optional before public

- Source maps + **`SENTRY_AUTH_TOKEN`** in EAS for readable stack traces.
- Rotate **`SLOTSYNC_API_KEY`** if a binary leaks; move to user-scoped tokens for prod.
