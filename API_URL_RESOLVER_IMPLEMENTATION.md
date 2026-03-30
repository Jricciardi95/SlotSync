# API Base URL Resolver Implementation

## Overview

Implemented a robust backend base URL resolver that automatically adapts to Wi-Fi IP changes without breaking the iOS dev client.

## Implementation Details

### Priority Order

The resolver checks sources in this order:

1. **`process.env.EXPO_PUBLIC_API_BASE_URL`** - Environment variable (highest priority)
2. **`Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL`** - From app.json
3. **Inferred from Expo `hostUri`** - Automatically detects IP from dev server (fallback)

### Files Modified

1. **`src/config/api.ts`**
   - Implemented `getApiBaseUrl()` with priority-based resolution
   - Added `inferBaseUrlFromHostUri()` to extract IP from Expo's hostUri
   - Added `checkBackendHealth()` for connectivity testing
   - Updated `API_CONFIG.BASE_URL` to use the new resolver

2. **`src/screens/ScanRecordScreen.tsx`**
   - Added health check on component mount
   - Added health check on screen focus
   - Imports `checkBackendHealth` and `getApiBaseUrl` from config

## Example Log Output

### When hostUri Fallback is Used Successfully

```
[API Config] 🔍 Checking API base URL sources:
[API Config]   process.env.EXPO_PUBLIC_API_BASE_URL: (not set)
[API Config]   Constants.expoConfig.extra.EXPO_PUBLIC_API_BASE_URL: (not set)
[API Config] 🔍 Inferred from hostUri: {
  hostUri: '192.168.1.60:8082',
  extractedHost: '192.168.1.60',
  inferredUrl: 'http://192.168.1.60:3000'
}
[API Config]   hostUri (192.168.1.60:8082): http://192.168.1.60:3000
[API Config] ✅ Selected from hostUri (192.168.1.60:8082): http://192.168.1.60:3000
[API Config] ✅ Using API base URL: http://192.168.1.60:3000
[ScanRecord] 🔍 Performing backend health check on mount...
[API Config] ✅ Health check passed: http://192.168.1.60:3000/health (45ms)
```

### When All Sources Are Available (env var wins)

```
[API Config] 🔍 Checking API base URL sources:
[API Config]   process.env.EXPO_PUBLIC_API_BASE_URL: http://192.168.1.131:3000
[API Config]   Constants.expoConfig.extra.EXPO_PUBLIC_API_BASE_URL: http://192.168.1.60:3000
[API Config] ✅ Selected from process.env.EXPO_PUBLIC_API_BASE_URL: http://192.168.1.131:3000
[API Config] ✅ Using API base URL: http://192.168.1.131:3000
[ScanRecord] 🔍 Performing backend health check on mount...
[API Config] ✅ Health check passed: http://192.168.1.131:3000/health (52ms)
```

### When Health Check Fails

```
[API Config] 🔍 Checking API base URL sources:
[API Config]   process.env.EXPO_PUBLIC_API_BASE_URL: (not set)
[API Config]   Constants.expoConfig.extra.EXPO_PUBLIC_API_BASE_URL: (not set)
[API Config] 🔍 Inferred from hostUri: {
  hostUri: '192.168.1.60:8082',
  extractedHost: '192.168.1.60',
  inferredUrl: 'http://192.168.1.60:3000'
}
[API Config]   hostUri (192.168.1.60:8082): http://192.168.1.60:3000
[API Config] ✅ Selected from hostUri (192.168.1.60:8082): http://192.168.1.60:3000
[API Config] ✅ Using API base URL: http://192.168.1.60:3000
[ScanRecord] 🔍 Performing backend health check on mount...
[API Config] ⚠️ Health check failed: http://192.168.1.60:3000/health (2000ms, error: Aborted)
```

## Key Features

1. **Automatic IP Detection**: When Wi-Fi IP changes, the resolver automatically detects the new IP from Expo's `hostUri` and builds the backend URL
2. **Health Checks**: Performs connectivity tests on app start and screen focus with 2-second timeout
3. **Comprehensive Logging**: Logs all candidate sources, selected URL, and health check results
4. **Single Source of Truth**: All API URL construction goes through `API_CONFIG.BASE_URL` or `getApiBaseUrl()`
5. **No Manual Updates Required**: When using Expo dev client, no need to update app.json when IP changes

## Usage

The resolver is used automatically. All existing code using `API_CONFIG.BASE_URL` will benefit from the new resolver without changes.

For health checks, they are automatically performed:
- On app start (ScanRecordScreen mount)
- When ScanRecordScreen comes into focus

## Testing

To test the hostUri fallback:

1. Remove `EXPO_PUBLIC_API_BASE_URL` from app.json
2. Ensure no environment variable is set
3. Start Expo dev client: `npx expo start --dev-client`
4. Check logs for hostUri inference

The resolver will automatically use the IP from the Expo dev server's hostUri.

