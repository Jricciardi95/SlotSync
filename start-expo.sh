#!/bin/bash
cd /Users/jamesricciardi/SlotSync

echo "📱 Starting Expo Frontend..."
echo ""
echo "Your IP: 192.168.1.215"
echo "API URL: http://192.168.1.215:3000"
echo ""
echo "Press 'i' for iOS, 'a' for Android, or scan QR code with Expo Go"
echo ""

npx expo start --clear
