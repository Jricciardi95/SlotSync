#!/bin/bash

# Test the identify-record endpoint
# Usage: ./test-identify-endpoint.sh /path/to/album-cover.jpg

if [ -z "$1" ]; then
  echo "Usage: $0 /path/to/album-cover.jpg"
  echo ""
  echo "This will test the /api/identify-record endpoint with an image file."
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "Error: File not found: $1"
  exit 1
fi

echo "🧪 Testing identify-record endpoint..."
echo "Image: $1"
echo ""

curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@$1" \
  -H "Content-Type: multipart/form-data" \
  | python3 -m json.tool 2>/dev/null || \
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@$1"

echo ""

