# Shelves Setup MVP (Blueprint Builder)

This MVP adds a visual setup home where users build a rough map of their listening area and tap shelves into Closer Look.

## Where to find it

- Open the **Stands** tab (now visual setup home).
- You will see **Shelves Setup** with a blueprint-style canvas.

## Create a visual setup

1. Tap **Add Shape**.
2. Choose shape type:
   - shelf
   - turntable
   - speaker
   - label
3. Choose a position preset:
   - top left
   - top right
   - middle
   - bottom left
   - bottom right
4. Name the shape.

For **shelf** shapes, choose either:
- **Create Unit** (name + slot count + optional ESP URL/IP), or
- **Link Existing Unit**.

Then tap **Add to Blueprint**.

## Open Closer Look from a shelf shape

- Tap any shelf shape on the canvas.
- App opens **Closer Look** directly for that linked shelf/unit.
- Records load sorted by slot.
- Centered record updates as you scroll.

## Shelf light behavior

- App sends logical slot-based highlight when centered record changes.
- Calls are debounced to avoid spamming ESP.
- If shelf is offline/unconfigured, browsing still works visually.

## Testing modes

### No physical shelf

- Blueprint and Closer Look should still work fully visually.
- You may see “Shelf offline - visual mode only” while browsing.

### With mock shelf

1. Start mock server:
   - `npm run mock:shelf`
2. In app Settings -> Smart shelf, set shelf URL:
   - iOS simulator: `http://localhost:8787`
   - Android emulator: `http://10.0.2.2:8787`
   - Physical phone: `http://<LAN_IP>:8787`
3. Open shelf shape -> Closer Look -> scroll.
4. Verify `/visual` updates and mapping logs in terminal.

### With ESP32 hardware later

- Keep app in logical shelf + slot terms.
- ESP firmware handles odd/even strip mapping.
- Use existing hardware validation runbook for final mapping checks.

## Exact MVP test path (copy this)

1. Open **Stands -> Shelves Setup**.
2. Tap **Add Shape**.
3. Create a **shelf** shape (name + slot count + create unit).
4. Assign at least one record to that shelf unit (existing assign flow).
5. Tap the shelf shape on blueprint.
6. Confirm **Closer Look** opens directly to that shelf.
7. Scroll horizontally and confirm centered album changes.
8. With mock shelf running, confirm shelf follows centered slot.
9. Repeat later with real ESP32 shelf.
