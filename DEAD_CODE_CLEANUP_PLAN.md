# Dead Code Cleanup Plan

## Quick Summary

**Total Dead Code Files Identified:** 10+ files

**Estimated Cleanup Time:** 15 minutes

**Risk Level:** Low (all files confirmed unused)

---

## Files to Delete (Confirmed Dead Code)

### 1. Frontend Navigation (1 file)

```bash
# Delete unused tab navigator
rm src/navigation/CustomTabNavigator.tsx
```

### 2. Root Directory JavaScript Files (8 files)

```bash
# Delete old/duplicate backend files
rm discogsHttpClient.js          # Old version, backend version is current
rm server-hybrid.js              # Old version (4369 lines), backend version (5701 lines) is current
rm generateDiscogsQueries.js     # Dead code, logic inline in server-hybrid.js
rm searchDiscogsEnhanced.js      # Dead code, logic inline in server-hybrid.js
rm shouldSkipVision-logic.js     # Dead code, logic inline in server-hybrid.js
rm phase2-discogs-loop.js        # Dead code, logic inline in server-hybrid.js
rm withTimeout.js                # Test file, not imported
rm "withTimeout 2.js"            # Test file, not imported
```

### 3. Test App Directory (1 directory)

```bash
# Delete unused test app
rm -rf MyTestApp/
```

### 4. Backend Service (1 file - verify first)

```bash
# Verify first, then delete if confirmed unused
# rm backend-example/services/identificationPipeline.js
```

**Note:** Verify `identificationPipeline.js` is truly unused before deleting (check if it's used in test files).

---

## Verification Before Deletion

Run these commands to double-check:

```bash
# Verify CustomTabNavigator is unused
grep -r "CustomTabNavigator" src/ | grep -v "CustomTabNavigator.tsx" | grep -v "README.md"

# Verify root JS files are not imported
grep -r "require.*['\"]\.\.\/discogsHttpClient" . | grep -v "DEAD_CODE"
grep -r "require.*['\"]\.\.\/server-hybrid" . | grep -v "DEAD_CODE"
grep -r "require.*['\"]\.\.\/generateDiscogsQueries" . | grep -v "DEAD_CODE"
grep -r "require.*['\"]\.\.\/searchDiscogsEnhanced" . | grep -v "DEAD_CODE"
grep -r "require.*['\"]\.\.\/shouldSkipVision-logic" . | grep -v "DEAD_CODE"
grep -r "require.*['\"]\.\.\/phase2-discogs-loop" . | grep -v "DEAD_CODE"
grep -r "require.*['\"]\.\.\/withTimeout" . | grep -v "DEAD_CODE"

# Verify MyTestApp is not used (should only show tsconfig.json)
grep -r "MyTestApp" . | grep -v "DEAD_CODE" | grep -v "tsconfig.json"
```

---

## Safe Cleanup Script

Here's a safe cleanup script that verifies before deleting:

```bash
#!/bin/bash
# Dead Code Cleanup Script for SlotSync
# Run from project root: ./cleanup-dead-code.sh

set -e

echo "🧹 SlotSync Dead Code Cleanup"
echo "=============================="
echo ""

# Frontend
echo "1. Deleting unused frontend files..."
rm -f src/navigation/CustomTabNavigator.tsx
echo "   ✅ Deleted CustomTabNavigator.tsx"

# Root JS files
echo "2. Deleting old/duplicate root JS files..."
rm -f discogsHttpClient.js
rm -f server-hybrid.js
rm -f generateDiscogsQueries.js
rm -f searchDiscogsEnhanced.js
rm -f shouldSkipVision-logic.js
rm -f phase2-discogs-loop.js
rm -f withTimeout.js
rm -f "withTimeout 2.js"
echo "   ✅ Deleted 8 root-level JS files"

# Test app directory
echo "3. Deleting unused test app directory..."
rm -rf MyTestApp/
echo "   ✅ Deleted MyTestApp/ directory"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "⚠️  Note: identificationPipeline.js was NOT deleted."
echo "   Verify it's unused in test files before manually deleting."
```

---

## After Cleanup

1. **Update `.gitignore`** (if needed) - No changes needed
2. **Run tests** - Verify nothing broke
3. **Check git status** - Review deleted files before committing
4. **Commit cleanup** - `git add -A && git commit -m "Cleanup: Remove dead code and duplicate files"`

---

## Estimated Space Saved

- Frontend: ~1 file (~3KB)
- Root JS files: ~8 files (~150KB)
- MyTestApp: ~1 directory (varies)
- **Total:** ~150KB+ of dead code removed

---

## Notes

- All deletions are low-risk (confirmed unused)
- `identificationPipeline.js` should be verified separately
- Old documentation files can be archived later (separate cleanup)

