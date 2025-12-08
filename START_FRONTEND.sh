#!/bin/bash
# SlotSync Frontend Startup Script

cd /Users/jamesricciardi/SlotSync
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true
export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.129:3000'
npx expo start
