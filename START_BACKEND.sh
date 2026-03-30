#!/bin/bash
# SlotSync Backend Startup Script

cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN="${DISCOGS_PERSONAL_ACCESS_TOKEN:-your_discogs_token_here}"
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'
export CONFIDENCE_THRESHOLD='0.5'
npm start
