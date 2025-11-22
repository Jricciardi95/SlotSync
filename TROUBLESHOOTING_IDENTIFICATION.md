# Troubleshooting Record Identification

## Current Error
- **Error**: "Could not identify record. Please try manual entry."
- **extractedText**: null
- **Meaning**: Google Vision couldn't read text from the album cover

## Possible Causes

### 1. Album Cover Has No Readable Text
- Some album covers are purely artistic/abstract
- No text visible on the cover
- Text is too stylized for OCR

**Solution**: Use manual entry for these albums

### 2. Image Quality Issues
- Photo is blurry
- Poor lighting
- Cover is at an angle
- Too far away

**Solution**: 
- Take a clear, well-lit photo
- Fill the frame with the album cover
- Ensure text is in focus

### 3. Google Vision API Issue
- API quota exceeded
- Authentication problem
- Network issue

**Solution**: Check backend server logs

## How to Debug

### Check Backend Logs
Look at Terminal 1 (backend server) for messages like:
```
[API] Processing image: ...
[API] Extracting text with Google Vision...
[API] Extracted text: ...
```

### Test with a Clear Text Cover
Try scanning an album cover with:
- Clear, readable text
- Good contrast
- Standard font
- Well-lit photo

### Check Server Status
```bash
curl http://localhost:3000/health
```

Should show:
```json
{
  "services": {
    "googleVision": "configured"
  }
}
```

## Solutions

### Option 1: Manual Entry
If OCR fails, use the "Enter Details Manually" option in the app

### Option 2: Improve Photo Quality
- Better lighting
- Closer to cover
- Fill the frame
- Hold steady

### Option 3: Add Discogs API
Discogs can help even without perfect OCR text

### Option 4: Check Backend Logs
See what Google Vision is actually returning

## Next Steps

1. **Check Terminal 1** (backend server) for detailed logs
2. **Try a different album** with clear text
3. **Take a better photo** with good lighting
4. **Use manual entry** if OCR consistently fails

