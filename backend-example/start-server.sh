#!/bin/bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set Discogs token
export DISCOGS_PERSONAL_ACCESS_TOKEN='DmcfxeRAXtsFNqCQAYsLpJMDOgVSoLcPKUFarcWv'

# Set Google Vision credentials
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'

# Kill any existing server
pkill -f "node.*server-hybrid" 2>/dev/null
sleep 1

# Start server
echo "🚀 Starting SlotSync Backend Server..."
echo "📍 Discogs token: Configured"
echo "📍 Google Vision: Configured"
echo ""
npm start
