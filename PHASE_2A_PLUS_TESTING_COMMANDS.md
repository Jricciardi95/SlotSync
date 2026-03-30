# Phase 2A+ Testing Commands

## Quick Start

### Terminal 1: Start Backend Server

```bash
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh
```

**OR manually:**

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token_here"
export ENABLE_GOOGLE_VISION=true
node server-hybrid.js
```

**Expected output:**
```
✅ Google Vision API client initialized
✅ Discogs API configured
✅ Connected to local database
✅ Vector index initialized with X embeddings
🚀 SlotSync API Server running on port 3000
```

---

### Terminal 2: Start Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

**Then:**
- Scan QR code with Expo Go app
- Make sure phone is on same Wi-Fi network

---

## Testing Phase 2A+ Features

### 1. Monitor Decision Logs

Watch for `[ScanDecision]` JSON logs in Terminal 1 (backend):

```bash
# In Terminal 1, you'll see logs like:
[ScanDecision] {"timestamp":"...","decision":"ACCEPT_EMBEDDING_FINAL","topEmbeddingSimilarity":0.95,...}
```

**What to look for:**
- `decision`: Should be `ACCEPT_EMBEDDING_FINAL`, `SKIP_VISION`, or `RUN_VISION`
- `topEmbeddingSimilarity`: Top match similarity (0.0-1.0)
- `top2Similarity`: Second match similarity (or null)
- `margin`: Difference between top1 and top2 (or null)
- `marginUnavailable`: true if only one match found
- `datasetSize`: Number of indexed embeddings
- `skipReasons`: Array of reasons if decision is RUN_VISION

---

### 2. Test Different Scenarios

#### A) Clean Album Cover (Should Skip Vision)
- Take photo of well-lit, centered album cover
- Expected: `decision: "SKIP_VISION"` or `"ACCEPT_EMBEDDING_FINAL"`
- Expected: `topEmbeddingSimilarity >= 0.92`

#### B) Glare/Angle Photo (May Run Vision)
- Take photo with glare, shadows, or off-angle
- Expected: `decision: "RUN_VISION"` (if similarity < 0.92)
- Expected: Lower `topEmbeddingSimilarity`

#### C) Text-Light Cover (Embedding Should Carry)
- Take photo of minimalist cover with little text
- Expected: `decision: "SKIP_VISION"` or `"ACCEPT_EMBEDDING_FINAL"` (if similarity high)
- Expected: High `topEmbeddingSimilarity` even without OCR

#### D) Busy Background/Partial Crop (Vision May Help)
- Take photo with cluttered background or partial crop
- Expected: `decision: "RUN_VISION"` (if similarity low or no valid ID)
- Expected: Vision called to help disambiguate

---

### 3. Optional: Save Logs to File

Set environment variable before starting backend:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export SCAN_DECISION_LOG_PATH="./scan-decisions.jsonl"
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token_here"
export ENABLE_GOOGLE_VISION=true
node server-hybrid.js
```

**Then view logs:**
```bash
# View all decisions
cat scan-decisions.jsonl

# Count ACCEPT_EMBEDDING_FINAL decisions
grep "ACCEPT_EMBEDDING_FINAL" scan-decisions.jsonl | wc -l

# View decisions with high similarity
grep -E '"topEmbeddingSimilarity":[0-9]\.[9][0-9]' scan-decisions.jsonl
```

---

## Verification Checklist

After scanning ~30 photos, verify:

- [ ] `[ScanDecision]` logs appear for every scan
- [ ] `decision` field is one of: `ACCEPT_EMBEDDING_FINAL`, `SKIP_VISION`, `RUN_VISION`
- [ ] `topEmbeddingSimilarity` is present (or null if no matches)
- [ ] `top2Similarity` is present when multiple matches exist
- [ ] `margin` is calculated correctly (top1 - top2)
- [ ] `marginUnavailable` is true when only one match
- [ ] `datasetSize` shows current embedding count
- [ ] `skipReasons` array populated for RUN_VISION decisions
- [ ] `finalDiscogsId` matches `top1Id` for ACCEPT_EMBEDDING_FINAL
- [ ] No "confident wrongs" (high similarity but wrong match)

---

## Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
lsof -ti:3000 | xargs kill -9

# Verify credentials
ls -la backend-example/credentials.json
echo $DISCOGS_PERSONAL_ACCESS_TOKEN
```

### No embedding matches
- Check dataset size: Look for `datasetSize` in logs
- If `datasetSize < 200`: Cold start protection active (will always RUN_VISION)
- Need to index more albums first

### Vision always runs
- Check `topEmbeddingSimilarity` in logs
- If similarity < 0.92: Normal (threshold not met)
- If similarity >= 0.92 but still RUN_VISION: Check `skipReasons` array

---

## Environment Variables Reference

```bash
# Phase 2A+ Thresholds (optional - defaults shown)
export STRONG_ACCEPT_THRESHOLD=0.94          # Treat as final
export STRONG_ACCEPT_MARGIN=0.04             # Margin for final
export SKIP_VISION_EMBEDDING_THRESHOLD=0.92  # Skip Vision threshold
export SKIP_VISION_MARGIN_THRESHOLD=0.03     # Margin for skip
export MIN_EMBEDDING_DATASET_SIZE=200        # Cold start protection

# Optional: Save decision logs to file
export SCAN_DECISION_LOG_PATH="./scan-decisions.jsonl"

# Required
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token"
export ENABLE_GOOGLE_VISION=true
```

---

## Quick Test Script

Save this as `test-phase2a.sh`:

```bash
#!/bin/bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set up environment
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="${DISCOGS_PERSONAL_ACCESS_TOKEN:-your_token}"
export ENABLE_GOOGLE_VISION=true
export SCAN_DECISION_LOG_PATH="./scan-decisions.jsonl"

# Start server
echo "🚀 Starting backend server..."
node server-hybrid.js
```

Make it executable:
```bash
chmod +x test-phase2a.sh
./test-phase2a.sh
```

