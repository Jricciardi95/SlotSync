# Testing with Discogs API Only

## ✅ Google Vision Temporarily Disabled

Google Vision has been temporarily disabled so you can test with Discogs API only.

## How to Disable/Enable Google Vision

### Disable Google Vision (Current)
```bash
# In Terminal 1 (backend server)
export ENABLE_GOOGLE_VISION=false
# Then restart server
```

Or set in your startup script:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token"
export ENABLE_GOOGLE_VISION=false
npm run start:hybrid
```

### Enable Google Vision Again
```bash
export ENABLE_GOOGLE_VISION=true
# Or just remove the variable (defaults to true)
```

## Current Behavior

### Without Google Vision:
- ❌ Cannot extract text from images automatically
- ✅ Can still search Discogs if you have artist/title
- ⚠️ Will return error asking for manual entry

### For Testing:
Since Discogs needs text to search, you'll need to:
1. Enter artist/title manually, OR
2. Re-enable Google Vision for OCR

## Note

**Discogs API requires text** (artist + title) to search. Without Google Vision OCR, the system cannot automatically extract this from images.

**Options:**
1. **Test with manual entry**: Enter artist/title manually in the app
2. **Re-enable Google Vision**: For automatic text extraction
3. **Use cached records**: If you've scanned albums before, they're in local DB

## Re-enable Google Vision

When ready to test with Google Vision again:
```bash
# Remove the disable flag or set to true
unset ENABLE_GOOGLE_VISION
# Or
export ENABLE_GOOGLE_VISION=true

# Restart server
npm run start:hybrid
```

---

## Smart Auto-Capture

The auto-capture now uses smart timing:
- **Initial**: 2.5 seconds (gives time to position)
- **If frame stable**: Captures in 1.5 seconds total (1s stability check + 0.5s capture)
- **Manual**: Tap button to capture immediately

This means well-aligned covers capture faster! 🚀

