#!/bin/bash

# Security Checklist Verification Script

echo "🔒 Security Best Practices Checklist"
echo "===================================="
echo ""

# Check 1: Credentials in .gitignore
echo "1. Checking if credentials are ignored by git..."
if git check-ignore backend-example/credentials.json 2>/dev/null; then
  echo "   ✅ credentials.json is in .gitignore"
else
  echo "   ❌ credentials.json is NOT ignored"
  echo "   ⚠️  Add to .gitignore immediately!"
fi

# Check 2: Credentials file exists
echo ""
echo "2. Checking credentials file..."
if [ -f "backend-example/credentials.json" ]; then
  echo "   ✅ credentials.json exists"
  
  # Check file permissions
  perms=$(stat -f "%A" backend-example/credentials.json 2>/dev/null || stat -c "%a" backend-example/credentials.json 2>/dev/null)
  if [ "$perms" = "600" ] || [ "$perms" = "400" ]; then
    echo "   ✅ File permissions are secure ($perms)"
  else
    echo "   ⚠️  File permissions: $perms (recommend 600)"
    echo "   Run: chmod 600 backend-example/credentials.json"
  fi
else
  echo "   ⚠️  credentials.json not found"
fi

# Check 3: Service account role (can't verify automatically)
echo ""
echo "3. Service account role:"
echo "   ⚠️  Manual check required"
echo "   Go to: https://console.cloud.google.com/iam-admin/serviceaccounts"
echo "   Verify role is: Cloud Vision API User (only)"

# Check 4: Environment variables
echo ""
echo "4. Checking environment variables..."
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  echo "   ✅ GOOGLE_APPLICATION_CREDENTIALS is set"
else
  echo "   ⚠️  GOOGLE_APPLICATION_CREDENTIALS not set"
fi

if [ -n "$DISCOGS_PERSONAL_ACCESS_TOKEN" ]; then
  echo "   ✅ DISCOGS_PERSONAL_ACCESS_TOKEN is set"
else
  echo "   ⚠️  DISCOGS_PERSONAL_ACCESS_TOKEN not set"
fi

# Check 5: Database files ignored
echo ""
echo "5. Checking database files..."
if git check-ignore backend-example/*.db 2>/dev/null; then
  echo "   ✅ Database files are in .gitignore"
else
  echo "   ⚠️  Database files should be in .gitignore"
fi

echo ""
echo "📋 Next Steps:"
echo "   - Set up billing alerts in Google Cloud Console"
echo "   - Schedule credential rotation (every 90 days)"
echo "   - Monitor API usage regularly"
echo ""
echo "📖 See: SECURITY_BEST_PRACTICES.md for details"

