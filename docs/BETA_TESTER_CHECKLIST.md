# SlotSync Beta Tester Checklist (Simple)

Thanks for testing. Please complete these quick checks.

## 1) Scan and Identify

- [ ] Open `Scan Record`.
- [ ] Scan at least 3 albums.
- [ ] Confirm app shows progress text while identifying.
- [ ] If a match appears, confirm details look right.

## 2) If Match Is Uncertain

- [ ] If you see `Possible matches`, pick the best one.
- [ ] If none are right, tap `None of These` and continue manually.
- [ ] Confirm you are never stuck.

## 3) Save and Review

- [ ] Save at least 1 identified album.
- [ ] Open the saved album in `Record Detail`.

## 4) Shelf (Optional if you have hardware)

- [ ] Tap `Light Slot`.
- [ ] Tap `Find on Shelf (Blink)`.
- [ ] Confirm shelf responds.

## Testing the Shelf Lights (Optional)

If your shelf is connected, this takes under 1 minute.

- Each shelf lights up one record position at a time.
- You do not need to understand wiring to run this test.

### Quick Test (4 steps)

1. Open a record that already has a known shelf slot.
2. Tap `Find on Shelf (Blink)`.
3. Confirm the correct shelf position lights up.
4. Repeat with 2-3 different records.

### Quick Consistency Check

- Try a few different records.
- The lit position should move in a consistent, even order across the shelf.
- If it looks random or out of order, report it.

Example slot order across shelf:
`[1] [2] [3] [4] [5] [6]`

Example:
If you tap `Find on Shelf` for a record in slot 3,
the third position from the left should blink.

When testing:
- Slot 1 -> first position
- Slot 2 -> next position
- Slot 3 -> next position

### Report if anything looks wrong

- Wrong spot lights up
- Lights are shifted left/right
- Lights do not turn on
- Lights flicker or behave inconsistently

If you're not sure, just tell me what you expected vs what actually happened.

Use the bug report template at the bottom of this document.

## 5) Report Anything Confusing or Broken

- [ ] Send at least one note on confusing UI or unclear wording.
- [ ] Include screenshots when possible.

---

# Copy/Paste Bug Report Template

Use this format for any issue:

```text
Title:
Short summary of issue

Build:
iOS/Android + app version/build number

Device:
Device model + OS version

Area:
(Scan / Candidate Picker / Manual Fallback / Save / Shelf / Other)

Steps to Reproduce:
1.
2.
3.

Expected Result:

Actual Result:

Frequency:
(Always / Often / Sometimes / Once)

Network:
(Wi-Fi / Cellular / Offline)

Shelf Setup:
(No shelf / Shelf on same Wi-Fi / Shelf on different network)

Screenshot/Video:
(attach if available)

Timestamp (UTC):
```
