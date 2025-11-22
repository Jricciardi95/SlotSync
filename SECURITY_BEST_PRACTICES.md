# Security Best Practices

## ✅ 1. Never Commit Credentials to Git

### Current Status
- ✅ `credentials.json` is in `.gitignore`
- ✅ All credential files are ignored: `**/credentials.json`, `**/*-*.json`
- ✅ Database files are ignored: `backend-example/*.db`

### Verification
```bash
# Check if credentials are ignored
git check-ignore backend-example/credentials.json
```

Should return: `backend-example/credentials.json`

### If Credentials Were Committed
If credentials were accidentally committed:
```bash
# Remove from git history (if needed)
git rm --cached backend-example/credentials.json
git commit -m "Remove credentials from git"
```

**Important**: If credentials were pushed to a public repo, rotate them immediately!

---

## ✅ 2. Use Least Privilege

### Current Service Account Role
- ✅ Role: **Cloud Vision API User** (correct - least privilege)
- ✅ Only has access to Vision API
- ✅ Cannot access other Google Cloud services

### Verify in Google Cloud Console
1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click on your service account
3. Check **"Roles"** tab
4. Should only show: **Cloud Vision API User**

### If Wrong Role
If service account has more permissions than needed:
1. Go to service account → **Permissions** tab
2. Remove unnecessary roles
3. Keep only: **Cloud Vision API User**

---

## ✅ 3. Rotate Credentials Regularly

### When to Rotate
- Every 90 days (recommended)
- If credentials are compromised
- If team member leaves
- Quarterly security review

### How to Rotate

#### Step 1: Create New Key
1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click on your service account
3. Go to **Keys** tab
4. Click **Add Key** → **Create new key** → **JSON**
5. Download new credentials file

#### Step 2: Update Application
```bash
# Backup old credentials (optional)
mv backend-example/credentials.json backend-example/credentials.json.old

# Replace with new credentials
mv ~/Downloads/new-credentials.json backend-example/credentials.json

# Restart server
# (server will automatically use new credentials)
```

#### Step 3: Delete Old Key
1. Go back to service account → **Keys** tab
2. Click **Delete** on old key
3. Confirm deletion

#### Step 4: Test
```bash
# Verify new credentials work
cd backend-example
node verify-setup.js
```

#### Step 5: Clean Up
```bash
# Remove old credentials file
rm backend-example/credentials.json.old
```

### Rotation Schedule
- **Next rotation**: [Set reminder for 90 days from now]
- **Last rotated**: [Today's date]

---

## ✅ 4. Monitor Usage

### Set Up Billing Alerts

#### Google Cloud Billing Alerts
1. Go to: https://console.cloud.google.com/billing
2. Select your billing account
3. Click **Budgets & alerts**
4. Click **Create budget**
5. Set:
   - **Budget amount**: $10 (or your limit)
   - **Alert threshold**: 50%, 90%, 100%
   - **Email notifications**: Your email
6. Click **Create**

#### Monitor API Usage
1. Go to: https://console.cloud.google.com/apis/dashboard
2. Select **Cloud Vision API**
3. Check **Metrics** tab for:
   - Request count
   - Error rate
   - Latency

### Free Tier Limits
- **Google Vision**: 1,000 requests/month free
- **Discogs**: 60 requests/minute (unlimited total)
- **MusicBrainz**: Unlimited (free)

### Usage Tracking
Create a simple usage log:
```bash
# Check current month usage
# (Google Cloud Console → APIs & Services → Dashboard)
```

---

## 🔒 Additional Security Measures

### Environment Variables (Production)
For production, use environment variables instead of files:

```bash
# Instead of credentials.json file, use:
export GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
```

Or use secret managers:
- **AWS**: Secrets Manager
- **Google Cloud**: Secret Manager
- **Heroku**: Config Vars

### HTTPS in Production
- Always use HTTPS in production
- Never send credentials over HTTP
- Use SSL/TLS certificates

### Rate Limiting
Add rate limiting to prevent abuse:
```javascript
// Example: Limit to 100 requests per hour per IP
const rateLimit = require('express-rate-limit');
app.use('/api/identify-record', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100
}));
```

### Input Validation
- Validate image file types
- Limit file sizes (already done: 10MB max)
- Sanitize all inputs

---

## 📋 Security Checklist

- [x] Credentials in `.gitignore`
- [x] Service account has least privilege (Cloud Vision API User only)
- [ ] Billing alerts set up
- [ ] Usage monitoring configured
- [ ] Credentials rotation scheduled (90 days)
- [ ] HTTPS configured (for production)
- [ ] Rate limiting implemented (for production)
- [ ] Input validation in place

---

## 🚨 If Credentials Are Compromised

### Immediate Actions
1. **Delete compromised key** in Google Cloud Console
2. **Create new key** immediately
3. **Update application** with new credentials
4. **Review access logs** in Google Cloud Console
5. **Check for unauthorized usage**
6. **Notify team** if applicable

### Prevention
- Never share credentials
- Use environment variables in production
- Rotate regularly
- Monitor usage for anomalies

---

## 📚 Resources

- [Google Cloud Security Best Practices](https://cloud.google.com/security/best-practices)
- [Service Account Security](https://cloud.google.com/iam/docs/service-accounts)
- [API Security](https://cloud.google.com/apis/design/security)

---

## ✅ Current Security Status

- ✅ Credentials not in git
- ✅ Least privilege configured
- ⚠️ Set up billing alerts (recommended)
- ⚠️ Schedule credential rotation (recommended)

