# GPT-4 Vision Testing Guide

## Quick Start

### 1. Set Environment Variables

```bash
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_GPT4_VISION='true'
```

### 2. Start Backend Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export ENABLE_GOOGLE_VISION='true'
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_GPT4_VISION='true'
export CONFIDENCE_THRESHOLD='0.5'
npm start
```

**Expected startup logs:**
```
[Config] ✅ GPT-4 Vision enabled
[GPT-4 Vision] ✅ OpenAI client initialized
✅ Google Vision API client initialized
🚀 SlotSync API Server (Enhanced) running on port 3000
```

---

## Testing Scenarios

### Scenario 1: Test GPT-4 Vision Directly

Test GPT-4 Vision in isolation with a difficult album cover:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_GPT4_VISION='true'
node test-gpt4-vision.js /path/to/album/cover.jpg
```

**Expected output:**
```
🧪 Testing GPT-4 Vision Integration
📸 Image: /path/to/cover.jpg
📏 Size: 245.32KB
🔄 Calling GPT-4 Vision API...
[GPT-4 Vision] 🧠 Starting intelligent image analysis...
[GPT-4 Vision] ✅ Received response from GPT-4 Vision
✅ SUCCESS!
📊 Results:
   Artist: Mick Jagger
   Title: Primitive Cool
   Year: 1987
   Confidence: 0.950
   Tracks: 12
⏱️  Duration: 3245ms
```

---

### Scenario 2: Test Full Pipeline (OCR Fails → GPT-4 Vision)

Use an album cover with stylized fonts or low contrast that OCR can't read:

1. **Start backend** (Terminal 1):
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export ENABLE_GOOGLE_VISION='true'
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_GPT4_VISION='true'
npm start
```

2. **Start frontend** (Terminal 2):
```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

3. **Scan difficult album cover** in the app

**Expected backend logs:**
```
[API] 🔍 Starting Google Vision analysis...
[API] ✅ Vision analysis complete
[API] ✅ Extracted 0 candidates  ← OCR failed
[API] 🧠 Vision candidates insufficient, trying GPT-4 Vision fallback...
[GPT-4 Vision] 🧠 Starting intelligent image analysis...
[GPT-4 Vision] ✅ Received response from GPT-4 Vision
[GPT-4 Vision] ✅ Parsed result: {"artist": "...", "title": "..."}
[API] ✅ GPT-4 Vision identified: "Artist" - "Title"
[Discogs] 🔍 Starting Discogs search...
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
```

---

### Scenario 3: Test Low Confidence Fallback

Use an album where Vision API finds candidates but confidence is low:

**Expected backend logs:**
```
[API] ✅ Extracted 2 candidates
[API] 🧠 Vision candidates insufficient, trying GPT-4 Vision fallback...
   (because all candidates have confidence < 0.5)
[GPT-4 Vision] 🧠 Starting intelligent image analysis...
[API] ✅ GPT-4 Vision identified: "Artist" - "Title"
```

---

### Scenario 4: Test Vision API Timeout → GPT-4 Vision

Use a very large image that causes Vision API timeout:

**Expected backend logs:**
```
[API] ⚠️  Google Vision timeout
[API] 🧠 Trying GPT-4 Vision as fallback after Vision timeout...
[GPT-4 Vision] 🧠 Starting intelligent image analysis...
[API] ✅ GPT-4 Vision identified: "Artist" - "Title"
```

---

## What to Verify

### ✅ Service Initialization
- Backend logs show: `[GPT-4 Vision] ✅ OpenAI client initialized`
- Backend logs show: `[Config] ✅ GPT-4 Vision enabled`

### ✅ GPT-4 Vision Activation
- Activates when no candidates from Vision API
- Activates when all candidates have confidence < 0.5
- Activates on Vision API timeout
- Activates on Vision API errors

### ✅ Results
- Returns structured JSON with artist, title, year, tracks
- Confidence score is reasonable (>= 0.5 for good matches)
- Tracks are extracted if visible on cover
- Reasoning is provided in logs

### ✅ Integration
- GPT-4 results are used as candidates
- Discogs search is performed with GPT-4 results
- Final response includes GPT-4 tracks if available
- Source is marked as `gpt4_vision` or `gpt4_vision+discogs`

---

## Troubleshooting

### GPT-4 Vision Not Activating

**Check:**
1. `OPENAI_API_KEY` is set correctly
2. `ENABLE_GPT4_VISION` is not set to 'false'
3. API key has sufficient credits
4. Backend logs show: `[Config] ✅ GPT-4 Vision enabled`

**Test:**
```bash
cd backend-example
export OPENAI_API_KEY='sk-...'
export ENABLE_GPT4_VISION='true'
node -e "const gpt4 = require('./services/gpt4Vision'); console.log('Enabled:', gpt4.isEnabled());"
```

Should output: `Enabled: true`

---

### API Errors

**401 Unauthorized:**
- Invalid API key
- Check: `echo $OPENAI_API_KEY`

**429 Too Many Requests:**
- Rate limit exceeded
- Wait a few minutes and retry

**500 Internal Server Error:**
- OpenAI service issue
- Check OpenAI status page

**Error: OpenAI client not initialized:**
- API key not set when server started
- Restart server with `OPENAI_API_KEY` set

---

### Low Confidence Results

**Possible causes:**
- Image is too unclear
- Cover is partially obscured
- Album is very obscure

**Solution:**
- Improve image quality
- Ensure full cover is visible
- Check if album exists in Discogs

---

## Cost Monitoring

### GPT-4 Vision Pricing (as of 2024)
- **Input**: ~$0.01 per image (varies by size)
- **Output**: ~$0.03 per 1K tokens

### Estimated Costs
- **Per identification**: ~$0.01-0.05 (only when used as fallback)
- **Monthly (1000 identifications)**: ~$10-50 (only for failed OCR cases)

### Optimization
- ✅ Only used as fallback (not for every request)
- ✅ Cached results in local DB
- ✅ Low temperature (0.3) for consistency
- ✅ Limited tokens (1000 max)

---

## Test Cases

### Test Case 1: Stylized Font Album
- **Image**: Album with decorative/stylized fonts
- **Expected**: OCR fails, GPT-4 Vision succeeds
- **Verify**: Artist and title correctly identified

### Test Case 2: Low Contrast Album
- **Image**: Dark album with light text (or vice versa)
- **Expected**: OCR fails, GPT-4 Vision succeeds
- **Verify**: Text is correctly extracted

### Test Case 3: All-Caps Text
- **Image**: Album with all-caps text (e.g., "MICK JAGGER PRIMITIVE COOL")
- **Expected**: OCR may work, but GPT-4 Vision verifies
- **Verify**: Correct capitalization in results

### Test Case 4: Partial Cover
- **Image**: Partially obscured or cropped cover
- **Expected**: GPT-4 Vision provides best guess with lower confidence
- **Verify**: Confidence < 0.7, but still provides useful result

### Test Case 5: Track List on Cover
- **Image**: Album with track list visible on cover
- **Expected**: GPT-4 Vision extracts tracks
- **Verify**: Tracks array is populated

---

## Success Criteria

✅ **Service loads correctly** - No errors on startup
✅ **GPT-4 Vision activates** - When OCR fails or confidence is low
✅ **Results are accurate** - Artist and title match the cover
✅ **Tracks are extracted** - If visible on cover
✅ **Integration works** - Results flow through to Discogs and final response
✅ **Cost is reasonable** - Only used as fallback, not for every request

---

## Next Steps After Testing

1. **Monitor costs** - Check OpenAI usage dashboard
2. **Adjust confidence threshold** - If GPT-4 Vision activates too often/rarely
3. **Improve image quality** - Better images = less need for GPT-4 Vision
4. **Cache results** - Already implemented in local DB
5. **Consider image embeddings** - For visual similarity matching (future enhancement)

