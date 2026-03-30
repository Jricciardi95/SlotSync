# Request Tracing Checklist

## Expected Log Lines During a Scan

When scanning an album cover, you should see these log lines in order:

### 1. Request Start
```
[REQ abc123] START /api/identify-record content-type=multipart/form-data; boundary=...
[REQ abc123] parse_upload complete elapsed=50ms fileSizeBytes=245678
```

### 2. Phase 1: Candidate Generation

#### Embedding Computation
```
[REQ abc123] embedding_compute_start
[REQ abc123] embedding_compute_complete elapsed=1234ms
```
**OR if timeout:**
```
[REQ abc123] TIMEOUT embedding after 15000ms
[REQ abc123] ERROR embedding_compute elapsed=15001ms Error: TIMEOUT:embedding:15000
```

#### Vector Search
```
[REQ abc123] vector_search_start
[REQ abc123] vector_search_complete elapsed=234ms top1Similarity=0.95 top1Id=12345 top2Similarity=0.87
```
**OR if timeout:**
```
[REQ abc123] TIMEOUT vector_search after 5000ms
[REQ abc123] ERROR vector_search elapsed=5001ms
```

#### Vision Decision
```
[REQ abc123] decideVisionStrategy_start
[REQ abc123] decideVisionStrategy_complete elapsed=5ms decision=ACCEPT_EMBEDDING_FINAL
```
**OR with reasons:**
```
[REQ abc123] decideVisionStrategy_complete elapsed=5ms decision=RUN_VISION reasons=[similarity_0.85_<_0.92,margin_0.02_<_0.03]
```

#### Vision API Call (if RUN_VISION)
```
[REQ abc123] vision_call_start
[REQ abc123] vision_call_complete elapsed=5678ms
```
**OR if timeout:**
```
[REQ abc123] TIMEOUT vision after 20000ms
[REQ abc123] ERROR vision_call elapsed=20001ms
```

#### Phase 1 Complete
```
[REQ abc123] phase1_start
[REQ abc123] phase1_complete elapsed=8901ms candidates=3
```

### 3. Phase 2: Resolve Best Album

#### Discogs Hydrate (if needed)
```
[REQ abc123] discogs_hydrate_start discogsId=12345
[REQ abc123] discogs_hydrate_complete elapsed=890ms
```
**OR if timeout:**
```
[REQ abc123] TIMEOUT discogs_hydrate after 15000ms
[REQ abc123] ERROR discogs_hydrate elapsed=15001ms
```

#### Discogs Search (if needed)
```
[REQ abc123] discogs_search_start artist="Pink Floyd" title="Dark Side"
[REQ abc123] discogs_search_complete elapsed=2345ms
```

#### Phase 2 Complete
```
[REQ abc123] phase2_start candidates=3
[REQ abc123] phase2_complete elapsed=3456ms
```

### 4. Phase 3: Enrich Metadata
```
[REQ abc123] phase3_start
[REQ abc123] phase3_complete elapsed=1234ms
```

### 5. Response Send
```
[REQ abc123] before_response_send
[REQ abc123] END status=200 totalMs=13591
```

### 6. Error Cases

#### Parse Error
```
[REQ abc123] ERROR parse_upload elapsed=50ms Error: File is empty
[REQ abc123] END status=400 totalMs=51
```

#### Phase Error
```
[REQ abc123] ERROR phase1 elapsed=8901ms Error: TIMEOUT:embedding:15000
[REQ abc123] END status=500 totalMs=8902
```

#### Timeout Error
```
[REQ abc123] TIMEOUT embedding after 15000ms
[REQ abc123] ERROR embedding_compute elapsed=15001ms Error: TIMEOUT:embedding:15000
[REQ abc123] END status=500 totalMs=15002
```

---

## Heartbeat Warnings (Steps >5s)

If any step takes longer than 5 seconds, you'll see:
```
[REQ abc123] ⚠️  HEARTBEAT embedding_compute still running after 5234ms
[REQ abc123] ⚠️  HEARTBEAT vision_call still running after 6789ms
[REQ abc123] ⚠️  HEARTBEAT discogs_hydrate still running after 8901ms
```

---

## Key Indicators

### ✅ Success Path
- All phases complete with `_complete` logs
- `END status=200` appears
- Total time < 30s typically

### ❌ Hang Detection
- Last log line is a `_start` without corresponding `_complete`
- No `END` log appears
- Look for the last completed phase to identify where it hung

### ⚠️ Timeout Detection
- `TIMEOUT <label> after <ms>ms` appears
- Followed by `ERROR <phase>` with elapsed time
- `END status=500` with timeout error message

---

## Example: Full Success Log Sequence

```
[REQ xyz789] START /api/identify-record content-type=multipart/form-data; boundary=----WebKitFormBoundary
[REQ xyz789] parse_upload complete elapsed=45ms fileSizeBytes=234567
[REQ xyz789] phase1_start
[REQ xyz789] embedding_compute_start
[REQ xyz789] embedding_compute_complete elapsed=1234ms
[REQ xyz789] vector_search_start
[REQ xyz789] vector_search_complete elapsed=234ms top1Similarity=0.95 top1Id=12345 top2Similarity=0.87
[REQ xyz789] decideVisionStrategy_start
[REQ xyz789] decideVisionStrategy_complete elapsed=5ms decision=ACCEPT_EMBEDDING_FINAL
[REQ xyz789] phase1_complete elapsed=1473ms candidates=1
[REQ xyz789] phase2_start candidates=1
[REQ xyz789] discogs_hydrate_start discogsId=12345
[REQ xyz789] discogs_hydrate_complete elapsed=890ms
[REQ xyz789] phase2_complete elapsed=890ms
[REQ xyz789] phase3_start
[REQ xyz789] phase3_complete elapsed=234ms
[REQ xyz789] before_response_send
[REQ xyz789] END status=200 totalMs=2597
```

---

## Example: Timeout During Embedding

```
[REQ abc123] START /api/identify-record content-type=multipart/form-data
[REQ abc123] parse_upload complete elapsed=50ms fileSizeBytes=234567
[REQ abc123] phase1_start
[REQ abc123] embedding_compute_start
[REQ abc123] ⚠️  HEARTBEAT embedding_compute still running after 5234ms
[REQ abc123] ⚠️  HEARTBEAT embedding_compute still running after 10234ms
[REQ abc123] TIMEOUT embedding after 15000ms
[REQ abc123] ERROR embedding_compute elapsed=15001ms Error: TIMEOUT:embedding:15000
[REQ abc123] ERROR phase1 elapsed=15002ms Error: TIMEOUT:embedding:15000
[REQ abc123] END status=500 totalMs=15003
```

---

## Verification Steps

1. **Start backend** and watch for startup logs
2. **Scan an album** from iPhone
3. **Check logs** - should see `[REQ <id>] START` immediately
4. **Follow the sequence** - each `_start` should have a matching `_complete`
5. **Check for END** - should always see `[REQ <id>] END status=... totalMs=...`
6. **If no END** - find the last `_start` without `_complete` to identify hang location

---

## Timeout Values

- **Embedding**: 30s (default, configurable via `EMBEDDING_TIMEOUT_MS`)
- **Vector Search**: 5s (default, configurable via `VECTOR_SEARCH_TIMEOUT_MS`)
- **Vision API**: 20s (default, configurable via `VISION_TIMEOUT_MS`)
- **Discogs Hydrate**: 15s (default, configurable via `DISCOGS_FETCH_TIMEOUT_MS`)
- **Discogs Search**: 15s (default, configurable via `DISCOGS_SEARCH_TIMEOUT_MS`)
- **Request Total**: 90s (default, configurable via `REQUEST_TIMEOUT_MS`)

If any operation exceeds its timeout, it will fail fast with a clear error message. The request-level timeout (90s) is a safety net that will fire if the entire request takes too long.

