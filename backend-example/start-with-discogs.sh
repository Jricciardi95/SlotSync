#!/bin/bash

# Start SlotSync Hybrid Backend with Discogs API

echo "🚀 Starting SlotSync Hybrid Backend with Discogs API..."
echo ""

# Set Google Vision credentials
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"

# Set Discogs Personal Access Token
export DISCOGS_PERSONAL_ACCESS_TOKEN="DmcfxeRAXtsFNqCQAYsLpJMDOgVSoLcPKUFarcWv"

# Disable Google Vision for testing Discogs only (set to 'true' to re-enable)
export ENABLE_GOOGLE_VISION=false

echo "⚠️  Google Vision: DISABLED (for testing Discogs only)"
echo "✅ Discogs API: configured"
echo ""
echo "Note: Without Google Vision, text extraction is disabled."
echo "      Discogs searches will only work with cached records or manual entry."
echo ""
echo "Starting server..."
echo ""

node server-hybrid.js

