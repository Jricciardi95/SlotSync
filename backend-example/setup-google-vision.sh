#!/bin/bash

# Google Vision Setup Helper Script

echo "🔍 Google Vision Setup Helper"
echo "================================"
echo ""

# Check if credentials already exist
if [ -f "./credentials.json" ]; then
    echo "✅ Credentials file found: ./credentials.json"
    echo ""
    echo "To use it, run:"
    echo "  export GOOGLE_APPLICATION_CREDENTIALS=\"./credentials.json\""
    echo "  npm run start:hybrid"
    exit 0
fi

echo "📋 Setup Steps:"
echo ""
echo "1. Go to: https://console.cloud.google.com/"
echo "2. Create a new project (or select existing)"
echo "3. Enable 'Cloud Vision API'"
echo "4. Create a service account"
echo "5. Download credentials JSON file"
echo ""
echo "📥 Once you have the JSON file:"
echo ""
echo "   Move it here:"
echo "   mv ~/Downloads/your-project-*.json ./credentials.json"
echo ""
echo "   Then set environment variable:"
echo "   export GOOGLE_APPLICATION_CREDENTIALS=\"./credentials.json\""
echo ""
echo "   And restart the server:"
echo "   npm run start:hybrid"
echo ""
echo "📖 For detailed instructions, see: HYBRID_SETUP.md"
echo ""

