# Internal QA Checklist (Private Beta)

Use this as a fast go/no-go before sending builds to testers.

## Build + Environment

- [ ] Preview build installs on iOS and/or Android test devices.
- [ ] App launches without crash.
- [ ] Staging `GET /health` returns 200.
- [ ] If API key protection is on: app build key matches server key.
- [ ] Sentry DSN set for preview build.

## Core Loop (Scan -> Confirm -> Place/Store -> Find -> Repeat)

- [ ] Scan flow shows progress states in order.
- [ ] Confirm screen shows confidence + explanation text.
- [ ] Uncertain scan shows candidate picker.
- [ ] `None of These` always reaches manual add (no dead-end).
- [ ] Save path works after direct match and candidate selection.

## Telemetry

- [ ] Breadcrumbs appear for identify start/success/fail/uncertain.
- [ ] Candidate confirmed event appears at least once.
- [ ] Manual fallback event appears at least once.

## Shelf

- [ ] `Light Slot` works for an assigned record.
- [ ] `Find on Shelf (Blink)` works for an assigned record.
- [ ] App remains usable when shelf is offline/misconfigured.

## Ship Decision

- [ ] No blocker in core loop.
- [ ] Known issues documented for testers.
- [ ] Build links and test instructions prepared.
