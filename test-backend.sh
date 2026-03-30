#!/bin/bash
echo "🧪 Testing SlotSync Backend"
echo "============================"
echo ""

echo "1️⃣  Testing Health Endpoint..."
curl -s http://localhost:3000/health | jq '.' || echo "❌ Backend not responding"
echo ""

echo "2️⃣  Testing Ping Endpoint..."
curl -s http://localhost:3000/api/ping | jq '.' || echo "❌ Backend not responding"
echo ""

echo "3️⃣  Testing API Info..."
curl -s http://localhost:3000/api | jq '.' || echo "❌ Backend not responding"
echo ""

echo "✅ Backend test complete!"
