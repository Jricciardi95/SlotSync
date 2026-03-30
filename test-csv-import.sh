#!/bin/bash

# ============================================
# SLOTSYNC - CSV IMPORT TESTING SCRIPT
# ============================================
# This script helps you test CSV import functionality
# Run this script to get step-by-step instructions

echo "============================================"
echo "SLOTSYNC - CSV IMPORT TESTING"
echo "============================================"
echo ""
echo "This script will help you test CSV import with automatic metadata fetching."
echo ""
echo "PREREQUISITES:"
echo "  ✓ Backend server must be running (Terminal 1)"
echo "  ✓ Expo must be running (Terminal 2)"
echo "  ✓ Your phone/emulator connected to Expo Go"
echo ""
echo "============================================"
echo ""

# Check if backend is running
echo "🔍 Checking backend server..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend server is running on port 3000"
else
    echo "❌ Backend server is NOT running"
    echo ""
    echo "Start it with:"
    echo "  cd /Users/jamesricciardi/SlotSync"
    echo "  ./start-backend-for-expo.sh"
    echo ""
    exit 1
fi

# Check if Expo is running
echo "🔍 Checking Expo server..."
if lsof -i:8081 > /dev/null 2>&1; then
    echo "✅ Expo server is running on port 8081"
else
    echo "❌ Expo server is NOT running"
    echo ""
    echo "Start it with:"
    echo "  cd /Users/jamesricciardi/SlotSync"
    echo "  npx expo start --clear"
    echo ""
    exit 1
fi

echo ""
echo "============================================"
echo "✅ ALL SYSTEMS READY"
echo "============================================"
echo ""
echo "TESTING STEPS:"
echo ""
echo "1. Open Expo Go app on your phone"
echo "2. Navigate to Library screen"
echo "3. Tap 'Import CSV' button"
echo "4. Select your CSV file"
echo ""
echo "WATCH THE LOGS:"
echo ""
echo "📱 Frontend logs (Expo terminal) will show:"
echo "   [CSV Import] 📝 Processing: \"Artist\" - \"Title\""
echo "   [CSV Import] 🔍 AUTO-FETCHING metadata..."
echo "   [CSV Import] ✅ Set cover art: https://..."
echo "   [CSV Import] ✅ Set X tracks"
echo ""
echo "🖥️  Backend logs (Backend terminal) will show:"
echo "   [API] 📥 INCOMING REQUEST: /api/identify-by-text"
echo "   [API] ✅ Text identification success"
echo "   [API] ✅ Tracks: X"
echo ""
echo "============================================"
echo ""
echo "If cover art and tracks are still missing, check:"
echo "  • Are the console logs showing API calls?"
echo "  • Are there any error messages?"
echo "  • Is the backend responding to /api/identify-by-text?"
echo ""
echo "To test the API directly:"
echo "  curl -X POST http://localhost:3000/api/identify-by-text \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"artist\":\"Radiohead\",\"title\":\"A Moon Shaped Pool\"}'"
echo ""

