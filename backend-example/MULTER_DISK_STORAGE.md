# Multer Disk Storage Implementation

## Summary

Changed multer from `memoryStorage()` to `diskStorage()` to reduce memory pressure during concurrent uploads.

## Changes Made

### 1. Multer Configuration (server-hybrid.js)

**Before:**
```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  // ...
});
```

**After:**
```javascript
// Configure multer for file uploads (disk storage to reduce memory pressure)
// Store temp files in backend-example/temp directory
const tempUploadDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
  logger.debug(`[Config] ✅ Created temp upload directory: ${tempUploadDir}`);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempUploadDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename: timestamp-random.ext
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `upload-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max (unchanged)
  // ...
});
```

### 2. Handler File Reading (server-hybrid.js)

**Before:**
```javascript
imageBuffer = req.file.buffer;
imageHash = generateImageHash(imageBuffer);
```

**After:**
```javascript
// Read file from disk (multer.diskStorage stores to req.file.path)
// This reduces memory pressure compared to memoryStorage during concurrent uploads
tempFilePath = req.file.path;
try {
  imageBuffer = fs.readFileSync(tempFilePath);
  logger.debug(`[REQ ${reqId}] ✅ Read ${imageBuffer.length} bytes from temp file: ${path.basename(tempFilePath)}`);
} catch (readError) {
  // Error handling with cleanup
  // ...
}
imageHash = generateImageHash(imageBuffer);
```

### 3. Cleanup in Finally Block (server-hybrid.js)

Added a `finally` block to ensure temp files are always deleted after processing:

```javascript
} finally {
  // CRITICAL: Always cleanup temp file after processing (success or error)
  // This prevents disk space leaks from concurrent uploads
  if (tempFilePath && fs.existsSync(tempFilePath)) {
    try {
      fs.unlinkSync(tempFilePath);
      logger.debug(`[REQ ${reqId}] 🧹 Cleaned up temp file: ${path.basename(tempFilePath)}`);
    } catch (cleanupError) {
      // Log but don't fail - cleanup errors are non-critical
      logger.warn(`[REQ ${reqId}] ⚠️  Failed to cleanup temp file ${path.basename(tempFilePath)}: ${cleanupError.message}`);
    }
  }
}
```

### 4. .gitignore Update

Added `backend-example/temp/` to `.gitignore` to prevent temp files from being committed.

## Benefits

1. **Reduced Memory Pressure**: Files are written to disk instead of kept in memory, allowing concurrent uploads without exhausting Node.js heap memory.

2. **Scalability**: Server can handle more concurrent requests without memory-related crashes.

3. **Clean Resource Management**: Temp files are automatically cleaned up in a `finally` block, preventing disk space leaks.

4. **Backward Compatible**: The same 10MB file size limit is maintained. All downstream code still receives a Buffer, so no API changes are required.

## Behavior

- **Temp Directory**: `backend-example/temp/`
- **File Naming**: `upload-{timestamp}-{random}.{ext}`
- **Cleanup**: Automatic in `finally` block (success or error)
- **Error Handling**: If file read fails, temp file is cleaned up before returning error response

## Testing

To verify:
1. Start server: `npm run start:hybrid`
2. Upload multiple images concurrently (e.g., 5-10 requests)
3. Check server logs for temp file creation/cleanup messages
4. Verify `backend-example/temp/` directory is empty after all requests complete
5. Monitor memory usage - should remain stable during concurrent uploads

## Notes

- Temp directory is created automatically on server start if it doesn't exist
- Temp files are cleaned up even if request fails or times out
- Cleanup errors are logged but don't cause request failures (non-critical)
- All existing API response formats and behavior remain unchanged

