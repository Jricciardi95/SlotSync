# Private Beta Test Runbook (New UX Behaviors)

Use this runbook to validate the six beta-polish behaviors added in the scan and shelf flow.

## Preconditions (for all tests)

- Install latest preview build (iOS TestFlight or Android APK).
- `EXPO_PUBLIC_API_BASE_URL` points to live staging backend.
- If API key protection is enabled on staging:
  - server has `SLOTSYNC_API_KEY`
  - app build has matching `EXPO_PUBLIC_SLOTSYNC_API_KEY`
- For telemetry checks, use a build with `EXPO_PUBLIC_SENTRY_DSN` set.

---

## 1) Identify Progress States

- **Requires real shelf:** No (app-only)
- **Setup needed:**
  - App installed and backend reachable.
  - Pick a record image that usually identifies successfully.
- **Steps:**
  1. Open `Scan Record`.
  2. Capture a cover image.
  3. Watch identifying screen text during processing.
- **Expected result:**
  - Status text progresses through:
    - `Scanning cover...`
    - `Matching album...`
    - `Confirming details...`
  - Then transitions to result/suggestions screen.
- **If it fails, record:**
  - Device + OS version.
  - Which status text was missing or out of order.
  - Approximate wait time before result/error.
  - Screenshot/video of the identify screen.

---

## 2) Confidence + Explanation Labels

- **Requires real shelf:** No (app-only)
- **Setup needed:**
  - Any successful identify result.
- **Steps:**
  1. Run an identify flow to reach `Confirm Match`.
  2. Inspect the match card under album info.
  3. Repeat with at least two different albums if possible.
- **Expected result:**
  - Confidence label appears (high/possible/low confidence wording).
  - Explanation line appears (barcode/cache/vision/discogs/pipeline wording).
  - Label and explanation are readable and not clipped.
- **If it fails, record:**
  - Missing label vs wrong label.
  - Exact text shown.
  - Screenshot of `Confirm Match` card.

---

## 3) Candidate Picker for Uncertain Matches

- **Requires real shelf:** No (app-only)
- **Setup needed:**
  - Use a difficult/ambiguous album image likely to produce low confidence.
- **Steps:**
  1. Open `Scan Record`, capture ambiguous cover.
  2. If low confidence, verify `Possible matches` screen appears.
  3. Confirm list is confidence-sorted and limited (top candidates).
  4. Select one candidate and tap `Use This`.
- **Expected result:**
  - Suggestions UI appears with clear guidance.
  - Candidate items show confidence labels.
  - Choosing a suggestion opens result confirmation flow using selected album.
- **If it fails, record:**
  - Number of candidates shown.
  - Whether selection was applied correctly.
  - Screenshot of suggestions list + selected candidate.

---

## 4) Manual Fallback (No Dead-End)

- **Requires real shelf:** No (app-only)
- **Setup needed:**
  - Trigger an uncertain or failed identify.
- **Steps:**
  1. From suggestions screen, tap `None of These`.
  2. Verify app routes to manual add flow.
  3. (Optional) Trigger a hard identification failure and choose manual entry from alert.
- **Expected result:**
  - User can always proceed to manual add.
  - No dead-end state requiring app restart.
  - Captured image is passed when available.
- **If it fails, record:**
  - Which path failed (`None of These` vs error alert path).
  - Whether image was preserved on manual screen.
  - Screenshot of last visible screen before failure.

---

## 5) Telemetry / Sentry Breadcrumbs

- **Requires real shelf:** No (app-only)
- **Setup needed:**
  - Preview build with valid `EXPO_PUBLIC_SENTRY_DSN`.
  - Access to Sentry project.
- **Steps:**
  1. Run one successful identify.
  2. Run one uncertain identify (candidate list).
  3. Run one manual fallback (`None of These`).
  4. In Sentry, inspect recent event trail/breadcrumbs for app session.
- **Expected result:**
  - Breadcrumb events exist for key actions:
    - identify started
    - identify succeeded / failed / uncertain
    - candidate confirmed
    - manual fallback opened
- **If it fails, record:**
  - Which event types are missing.
  - App build identifier/version.
  - Approximate timestamp (UTC).
  - Screenshot/export of Sentry breadcrumb trail.

---

## 6) Shelf Find Mode Blink (Record Detail)

- **Requires real shelf:** Yes (ESP32 shelf on same LAN)
- **Setup needed:**
  - Shelf configured in Settings.
  - A record assigned to a location/slot.
  - Phone + shelf on same Wi-Fi.
- **Steps:**
  1. Open `Record Detail` for a slotted record.
  2. Tap `Find on Shelf (Blink)`.
  3. Observe shelf LED behavior and app response.
- **Expected result:**
  - Shelf blinks target slot.
  - App shows confirmation alert.
  - No crash or stuck loading state.
- **If it fails, record:**
  - Shelf IP and Wi-Fi details (same network or not).
  - Whether regular `Light Slot` works.
  - Error text shown in app.
  - Short video of shelf response.

---

## Pass/Fail Summary Template

For each behavior, mark:
- `PASS`
- `PASS with notes`
- `FAIL`

Minimum private-beta release confidence:
- 1, 2, 4 must pass on at least 2 devices.
- 3 should pass on at least one ambiguous scan case.
- 5 should show breadcrumbs in at least one session.
- 6 should pass on at least one real shelf setup.

---

## Hardware Validation: 1 ESP per Shelf, 2 Staggered Strips

This validates the physical mapping model:

- One shelf module = one ESP = one logical shelf unit in the app.
- Odd strip handles slots `1,3,5,7...`
- Even strip handles slots `2,4,6,8...`

### Important Architecture Note

The app should only think in **logical shelf + slot** terms.  
Odd/even strip mapping must be handled internally by ESP firmware.

### Quick Mapping Test (Per Shelf Module)

- **Requires real shelf:** Yes
- **Setup needed:**
  - Shelf reachable from app (same Wi-Fi).
  - Known shelf module with both strips connected.
  - At least one record assigned to that shelf for blink/find validation.
- **Steps:**
  1. From app controls (or shelf test controls), trigger slot `1`.
  2. Trigger slot `2`.
  3. Trigger slot `3`.
  4. Trigger slot `4`.
  5. Trigger `Find on Shelf (Blink)` for a record in a known slot.
- **Expected result:**
  - Slot `1` lights odd strip.
  - Slot `2` lights even strip.
  - Slot `3` lights odd strip.
  - Slot `4` lights even strip.
  - Blink/find mode blinks the correct logical slot.

### Interpretation Guide

- **Wrong strip lights up (odd command lights even strip or vice versa):**
  - Odd/even GPIO assignment is likely swapped in firmware config.
- **Correct strip lights, but wrong physical position on that strip:**
  - Strip direction (`reverseOddStrip` / `reverseEvenStrip`) may be wrong.
  - Or slot offset mapping is incorrect.
- **Pattern is consistently shifted by N slots:**
  - Offset values likely misconfigured.
- **Alternating pattern is inverted globally (all odds/evens flipped):**
  - Odd/even strip identity reversed (pins or assignment labels).

### Firmware Config Values to Verify

For each shelf ESP firmware config, check:

- `oddStripGpioPin` / odd strip pin assignment
- `evenStripGpioPin` / even strip pin assignment
- `oddStripLedCount`
- `evenStripLedCount`
- `reverseOddStrip`
- `reverseEvenStrip`
- `oddStripOffset` / `evenStripOffset` (if your firmware supports offsets)

### Per-Shelf Module Checklist

Repeat this for **each shelf module**:

- [ ] Shelf module responds from app as one logical unit.
- [ ] Slot 1 -> odd strip
- [ ] Slot 2 -> even strip
- [ ] Slot 3 -> odd strip
- [ ] Slot 4 -> even strip
- [ ] Blink/find mode targets correct slot on correct strip
- [ ] No reversed direction issue
- [ ] No offset/shift issue
- [ ] Firmware config values documented and saved for this shelf
