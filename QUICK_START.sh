#!/bin/bash
# SlotSync Quick Start Script
# Your IP: 192.168.1.129

echo "🚀 SlotSync Quick Start"
echo "======================"
echo ""
echo "This script will help you start the backend and frontend."
echo "You'll need 2 terminal windows."
echo ""
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

echo ""
echo "📋 TERMINAL 1 - Backend Commands:"
echo "--------------------------------"
echo "cd /Users/jamesricciardi/SlotSync/backend-example"
echo "export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'"
echo "export GOOGLE_APPLICATION_CREDENTIALS='/path/to/your/google-credentials.json'"
echo "export CONFIDENCE_THRESHOLD='0.5'"
echo "npm start"
echo ""
echo "Press Enter to see Terminal 2 commands..."
read

echo ""
echo "📱 TERMINAL 2 - Frontend Commands:"
echo "--------------------------------"
echo "cd /Users/jamesricciardi/SlotSync"
echo "export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true"
echo "export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.129:3000'"
echo "npx expo start"
echo ""
echo "Press Enter to see testing commands..."
read

echo ""
echo "🧪 TERMINAL 3 - Testing Commands:"
echo "--------------------------------"
echo "curl http://localhost:3000/health"
echo "curl http://localhost:3000/api/ping"
echo ""
echo "✅ Done! Copy the commands above into your terminals."
