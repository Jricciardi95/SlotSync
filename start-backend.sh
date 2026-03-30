#!/bin/bash
cd /Users/jamesricciardi/SlotSync/backend-example

export DISCOGS_PERSONAL_ACCESS_TOKEN="${DISCOGS_PERSONAL_ACCESS_TOKEN:-your_discogs_token_here}"
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'

echo "🚀 Starting SlotSync Backend..."
npm start
