#!/bin/bash

# Quick Start Script for Backend Server (Expo Go)
# This script starts the backend server with proper configuration

echo "🚀 Starting SlotSync Backend for Expo Go..."
echo ""

# Navigate to backend directory
cd "$(dirname "$0")/backend-example" || exit 1

# Check if credentials exist and set absolute path
CREDENTIALS_PATH=""
if [ -f "./credentials.json" ]; then
    CREDENTIALS_PATH="$(pwd)/credentials.json"
    export GOOGLE_APPLICATION_CREDENTIALS="$CREDENTIALS_PATH"
    echo "✅ Google Vision credentials found: $CREDENTIALS_PATH"
elif [ -f "./credentials/credentials.json" ]; then
    CREDENTIALS_PATH="$(pwd)/credentials/credentials.json"
    export GOOGLE_APPLICATION_CREDENTIALS="$CREDENTIALS_PATH"
    echo "✅ Google Vision credentials found: $CREDENTIALS_PATH"
elif [ -f "../credentials.json" ]; then
    CREDENTIALS_PATH="$(cd .. && pwd)/credentials.json"
    export GOOGLE_APPLICATION_CREDENTIALS="$CREDENTIALS_PATH"
    echo "✅ Google Vision credentials found: $CREDENTIALS_PATH"
else
    echo "⚠️  Google Vision credentials not found (will use MusicBrainz fallback)"
    echo "   Searched: ./credentials.json, ./credentials/credentials.json, ../credentials.json"
fi

# Check for Discogs token (prefer environment variable for security)
if [ -n "$DISCOGS_PERSONAL_ACCESS_TOKEN" ]; then
    echo "✅ Discogs API token found (from environment)"
else
    # Fallback: check if set in script (less secure, but convenient)
    # For better security, set it as environment variable:
    # export DISCOGS_PERSONAL_ACCESS_TOKEN='your_token'
    # Or add to ~/.zshrc: export DISCOGS_PERSONAL_ACCESS_TOKEN='your_token'
    export DISCOGS_PERSONAL_ACCESS_TOKEN="DmcfxeRAXtsFNqCQAYsLpJMDOgVSoLcPKUFarcWv"
    echo "✅ Discogs API token configured (from script)"
fi

echo ""
echo "📡 Finding your computer's IP address..."
IP=$(ipconfig getifaddr en0 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$IP" ]; then
    echo "⚠️  Could not automatically detect IP address"
    echo "   Please find it manually:"
    echo "   Mac: System Settings > Network > Wi-Fi > Details > IP Address"
    echo "   Or run: ifconfig | grep 'inet ' | grep -v 127.0.0.1"
else
    echo "✅ Your IP address: $IP"
    echo ""
    echo "📱 Configure Expo Go to use: http://$IP:3000"
    echo "   Update app.json or .env with: EXPO_PUBLIC_API_BASE_URL=http://$IP:3000"
fi

echo ""
echo "🔧 Starting server on port 3000..."
echo "   (Press Ctrl+C to stop)"
echo ""

# Start the server
npm start

