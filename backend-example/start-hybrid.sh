#!/bin/bash

# SlotSync Hybrid Backend Startup Script

echo "🚀 Starting SlotSync Hybrid Backend..."
echo ""

# Check if credentials file exists
if [ -f "./credentials.json" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
    echo "✅ Google Vision credentials found"
else
    echo "⚠️  Google Vision credentials not found (credentials.json)"
    echo "   Server will work with MusicBrainz fallback only"
fi

# Check if Discogs keys are set
if [ -n "$DISCOGS_API_KEY" ] && [ -n "$DISCOGS_API_SECRET" ]; then
    echo "✅ Discogs API keys configured"
else
    echo "⚠️  Discogs API keys not set"
    echo "   Set DISCOGS_API_KEY and DISCOGS_API_SECRET to enable"
    echo "   Server will use MusicBrainz fallback"
fi

echo ""
echo "Starting server..."
echo ""

node server-hybrid.js

