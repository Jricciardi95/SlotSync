# SlotSync production readiness

Opinionated plan to move from “works on my desk” to **shippable product**. Your codebase paths are **repo-relative**.

---

## 1) Checklists

### App Store / Play Store

- [ ] **Apple Developer Program** + **Google Play Console** accounts.
- [ ] **Unique bundle IDs** you control: iOS `com.slotsync.app`, Android `package` same in `app.json` (change if you do not own `slotsync.app` branding — e.g. `com.yourcompany.slotsync`).
- [ ] **EAS project**: `npm i -g eas-cli` → `eas login` → `eas build:configure`.
- [ ] **Privacy Nutrition Labels** (iOS) + **Data safety** (Android): camera, local network, optional crash data if you add Sentry.
- [ ] **App Review explanations**: why local network / cleartext (LAN backend + ESP32).
- [ ] **Screenshots, description, support URL**, age rating.
- [ ] **Internal / TestFlight / Play internal track** before public.
- [ ] Remove or gate **`DevTestScreen`** (`__DEV__` only — already).

### Backend / infrastructure

- [ ] **Hosted Node server** (your `backend-example/server-hybrid.js` or extracted service), not only a laptop on Wi‑Fi.
- [ ] **HTTPS** in production (App Transport Security / Play cleartext policy); keep LAN dev exceptions **out** of store builds or document exception scope.
- [ ] **Secrets**: Google Vision, Discogs, etc. in **server env** only — never ship in `app.json` `extra` for production (rotate `EXPO_PUBLIC_API_BASE_URL` to your API host).
- [ ] **Health** + **uptime** monitoring (`/health`).
- [ ] **Backups** if you add server-side user data later (today mostly client SQLite).

### Networking (LAN shelf)

- [ ] Document: shelf is **optional**; app works without ESP32.
- [ ] **User-visible status**: `ShelfOfflineBanner` + **Settings → Smart shelf** (`ShelfConnectionPanel.tsx`).
- [ ] **Timeouts/retries**: `src/config/shelfConfig.ts` (`SHELF_REQUEST_TIMEOUT_MS`, `SHELF_MAX_RETRIES`) — tune after field testing.
- [ ] **Firmware** versioned and flash instructions (`firmware/README.md`, `APP_HTTP_CONTRACT.md`).

### Privacy / permissions

- [ ] **Camera**: required for scan — `expo-camera` plugin message in `app.json`.
- [ ] **Local network** (iOS): `NSLocalNetworkUsageDescription` in `app.json` — already set.
- [ ] **Microphone**: **removed** from Android `permissions`; `recordAudioAndroid: false` on `expo-camera` — **verify** on a release APK that Play Console does not still list mic (rebuild after prebuild).
- [ ] **Photo library** (`expo-image-picker`) — ensure usage strings if you ship flows that need it.

### Logging / monitoring

- [ ] **No raw `console.log` in hot paths** for release — migrate remaining files to `src/utils/logger.ts` (see §2).
- [ ] **Sentry** (recommended): `EXPO_PUBLIC_SENTRY_DSN` + `npx expo install @sentry/react-native` + wire `initMonitoring` in `src/monitoring/initMonitoring.ts`.
- [ ] **Error boundary** reports via `logger.captureException` (`App.tsx`).

### UX edge cases

- [ ] **Backend down / wrong URL**: identification errors + `ScanRecordScreen` / `useRecordIdentification` flows — user sees alerts or retry UI; improve copy where still generic.
- [ ] **Shelf offline**: banner + Settings; lighting actions that use `silent: true` stay quiet by design — **document** in UI copy where needed.
- [ ] **Airplane mode**: SQLite still works; sync/API fails — ensure no infinite spinners (audit `RecordDetailScreen` loading paths).
- [ ] **Batch jobs**: `BatchProcessingService` — failures stored on photo rows; confirm `BatchReviewScreen` explains errors clearly.

---

## 2) Specific to this repo

### Files already improved in this pass

| Area | Files |
|------|--------|
| Logger | `src/utils/logger.ts` — dev-only verbose logs; prod-sanitized `error`; `captureException` hook |
| Monitoring stub | `src/monitoring/initMonitoring.ts`, called from `App.tsx` |
| Identification noise | `src/services/identification/orchestrator.ts` — removed URL spam; uses `logger` + `captureException` |
| App init | `App.tsx` — `logger` + `initMonitoring` |
| Batch | `src/services/BatchProcessingService.ts` — `logger` instead of `console` |
| Record detail | `src/screens/RecordDetailScreen.tsx` — `logger` instead of `console` |
| Nav + shelf banner | `src/navigation/NavigationContext.tsx` (breaks import cycle), `CustomNavigation.tsx`, `ShelfOfflineBanner.tsx` |
| Shelf retries | `src/services/shelfApi/http.ts` — per-attempt noise → `logger.debug` |
| EAS | `eas.json` |
| IDs | `app.json` — `com.slotsync.app`, Android `package`, mic removed + `recordAudioAndroid: false` |
| Docs | `docs/SETUP.md`, this file |

### `console.*` still to migrate (high volume)

Run: `rg "console\.(log|error|warn)" src` — priority buckets:

- **`src/data/database.ts`**, **`src/data/repository.ts`** — migration / debug; gate or `logger.debug`.
- **`src/screens/CSVImportScreen.tsx`**, **`LibraryScreen.tsx`**, **`BatchScanScreen.tsx`**, **`AddRecordScreen.tsx`** — user-facing flows.
- **`src/utils/imageConverter.ts`**, **`imageResize.ts`**, **`imageHash.ts`** — swap to `logger.debug`.
- **`src/services/metadata/*`**, **`vision/*`** — `logger.debug` for dev tracing.

### Error handling / UX gaps (still true)

- **`ShelfLightingClient.setSlotLight`**: `color` / `brightness` / `effect` **are not sent** to firmware — either implement `/selectedcolor` + `/brightness` calls or remove from public TS types to avoid false expectations (`ShelfLightingClient.ts`).
- **`RecordDetailScreen` `handleLight`**: passes unused color/brightness — harmless but confusing; align with API or extend client.
- **Backend URL in `app.json` `extra`**: `EXPO_PUBLIC_API_BASE_URL` points at a **LAN IP** — **must be overridden per environment** via EAS env/secrets for any non-LAN build.
- **Custom navigation**: no deep linking / URL scheme parity with React Navigation — fine for v1 if you do not advertise universal links.

---

## 3) Top 5 blockers (ranked) + how to fix

### 1) No production backend + TLS (blocks public launch)

**Why:** Store apps calling `http://192.168.x.x:3000` will fail review or break off-LAN users.

**Fix:**

- Deploy `backend-example` (or slim API) to **Fly.io / Railway / Render / AWS** with **HTTPS**.
- Set `EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com` in **EAS production** env.
- Remove hardcoded LAN IP from committed `app.json` for main branch or use `.env` + EAS only.

### 2) EAS / signing not exercised (blocks shipping binaries)

**Why:** Without `eas build`, you have no reproducible release artifacts.

**Fix:**

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build --profile development --platform ios   # dev client
eas build --profile preview --platform all         # internal testers
eas build --profile production --platform all      # store candidates
```

Fill `eas.json` submit section when ready (`eas submit --profile production`).

### 3) Crash reporting not wired (blocks confident iteration)

**Why:** You cannot see production failures.

**Fix:** `npx expo install @sentry/react-native`, follow [Expo + Sentry](https://docs.expo.dev/guides/using-sentry/), set `EXPO_PUBLIC_SENTRY_DSN`, implement `initMonitoring()` to call `Sentry.init`, and assign:

```ts
(globalThis as any).__SLOTSYNC_REPORT_ERROR__ = (e, ctx) =>
  Sentry.captureException(e, { extra: ctx });
```

(`logger.captureException` already checks this global.)

### 4) Remaining `console` + sensitive data in logs (blocks privacy / professionalism)

**Why:** Accidental PII or URLs in device logs.

**Fix:** Continue migrating to `logger`; never log full `FormData` or tokens. Audit `rg console\. src`.

### 5) Product copy / empty states for “no shelf / no backend” (blocks support load)

**Why:** Silent failures reduce trust.

**Fix:** You now have **`ShelfOfflineBanner`** when URL is saved and requests fail. Add similar **one-line backend status** on `ScanRecordScreen` or Library (optional): reuse `checkBackendHealth` from `src/config/api.ts`.

---

## 4) Build pipeline (what was added)

### `eas.json` profiles

| Profile | Purpose |
|---------|---------|
| **development** | Dev client, simulator iOS, APK Android, `EXPO_PUBLIC_APP_ENV=development` |
| **preview** | Internal testers, `channel: preview` |
| **production** | Store builds, AAB Android, auto version increment, `channel: production` |

### Commands

```bash
# Dev client (local iteration with native modules)
eas build --profile development --platform ios
eas build --profile development --platform android

# Beta
eas build --profile preview --platform all

# Store
eas build --profile production --platform all
eas submit --platform ios --latest
eas submit --platform android --latest
```

### Bundle identifier

- **Before:** `com.anonymous.SlotSync`
- **Now:** `com.slotsync.app` (iOS + Android `package`)

If you prefer your name: `com.jricciardi.slotsync` — change **both** places in `app.json` and re-register with Apple/Google.

---

## 5) Logging + monitoring (design)

- **`logger.debug` / `info` / `verbose`:** `__DEV__` only.
- **`logger.warn`:** `__DEV__` only (less prod noise).
- **`logger.error`:** prod prints **short** lines.
- **`logger.captureException`:** boundary + identification; wire Sentry via global hook (§3).

---

## 6) Shelf communication audit (current behavior)

| Topic | Implementation |
|-------|------------------|
| Timeouts | `fetch` + `AbortController` in `shelfApi/http.ts`, default `SHELF_REQUEST_TIMEOUT_MS` from `shelfConfig.ts` |
| Retries | `SHELF_MAX_RETRIES` with backoff |
| Connection memory | `connectionState.ts` — `lastError`, `lastSuccessAt`, `subscribeShelfConnection` |
| User feedback | Alerts in `ShelfConnectionPanel` on test actions; **`ShelfOfflineBanner`** when configured + last failure |
| Silent calls | `ShelfLightingClient` `{ silent: true }` — still updates `connectionState` on failure; **no alert** by design |

**Optional improvement:** after silent failure, show a **non-blocking toast** once per session (would need a tiny toast context).

---

## 7) Permissions + privacy — `RECORD_AUDIO`

- **Scan flow** uses camera + stills / barcode — **no microphone required** for current features.
- **Changes made:** removed `RECORD_AUDIO` from `app.json` `android.permissions`; set **`recordAudioAndroid: false`** on `expo-camera` plugin.
- **If you add video notes later:** re-enable deliberately and add Play + App Store disclosure (“audio paired with video…”).

---

## 8) Backend assumptions

| Dependency | Client entry | Production needs |
|------------|----------------|------------------|
| Identify album | `orchestrator.ts` → `getApiUrl` + `/api/identify-record` | Hosted API, TLS, file upload size limits |
| Health / URL pick | `src/config/api.ts` `initializeApiBaseUrl`, `/health` | Same host, monitoring |
| Optional metadata clients | `src/services/metadata/*` if called from app | Many are **client-side** Discogs/MB — rate limits + user-agent policy |
| ESP32 | `shelfApi/*` | Not “backend”; LAN device |

**Auth:** Today **no app user auth** on API — anyone who can reach your server can hit identification. For public launch add **API keys**, **per-install tokens**, or **Clerk/Auth0** + server verification.

**Rate limiting:** Required on **`/api/identify-record`** (expensive Vision/Discogs path).

**Monitoring:** Request counts, p95 latency, 5xx rate, Vision/Discogs error ratio.

---

## 9) Phased rollout

### Phase 1 — Personal / dev stable

- [ ] LAN backend + physical device testing loop (`docs/SETUP.md`).
- [ ] `npm run typecheck` clean.
- [ ] Shelf URL saved; banner behaves when unplugged ESP32.
- [ ] One **preview** EAS build on your phone.

### Phase 2 — Private beta (10–50)

- [ ] **HTTPS** backend staging.
- [ ] EAS **preview** channel + OTA updates (optional).
- [ ] **Sentry** on.
- [ ] Migrate **most** `console.*` to `logger`.
- [ ] Short **privacy policy** + support email.

### Phase 3 — Public launch

- [ ] Production API + **auth/rate limits**.
- [ ] **production** EAS profile builds only for stores.
- [ ] App Review assets + explanations (camera, local network).
- [ ] Remove dev URLs from repo defaults; secrets only in EAS.

---

## 10) What I would do if I were shipping SlotSync

1. **Rename bundle ID** to a domain you own; register **today** (IDs are scarce).
2. **Deploy backend** behind HTTPS **this week**; point production env there.
3. **Sentry** before first beta APK/IPA leaves your machine.
4. **Rate limit** identification endpoint **before** sharing a public API URL.
5. Keep **shelf optional** in marketing; the app is a **library + identification** product first, **hardware** second.
6. **Do not** ship `EXPO_PUBLIC_API_BASE_URL` as a private LAN IP on the branch you submit to Apple/Google.

---

## Quick command reference

```bash
npm run typecheck
npx expo start
eas build --profile production --platform all
```

For questions specific to one screen, grep the feature name under `src/screens/` and trace to `src/services/` and `src/config/`.
