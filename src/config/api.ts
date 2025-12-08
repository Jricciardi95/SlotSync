/**
 * API Configuration for SlotSync
 * 
 * CRITICAL: EXPO_PUBLIC_API_BASE_URL MUST be set for the app to work!
 * 
 * Physical devices CANNOT reach localhost - they need your computer's LAN IP.
 * 
 * To configure:
 * 1. Create a .env file in the project root
 * 2. Add: EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:3000
 *    (Replace 192.168.x.x with your computer's IP address)
 * 3. Find your IP: 
 *    - Mac: System Settings > Network > Wi-Fi > Details > IP Address
 *    - Or run: ifconfig | grep "inet " | grep -v 127.0.0.1
 * 
 * For local development:
 * - iOS Simulator: http://localhost:3000 (only works in simulator!)
 * - Android Emulator: http://10.0.2.2:3000 (only works in emulator!)
 * - Physical device: http://YOUR_COMPUTER_IP:3000 (REQUIRED for real devices!)
 */

import Constants from 'expo-constants';

const getApiBaseUrl = (): string => {
  // Try multiple sources for the API base URL
  // 1. Environment variable (from terminal export or .env file)
  // 2. app.json extra section (via Constants)
  let baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  
  // If not found in process.env, try Constants.expoConfig.extra
  if (!baseUrl && Constants.expoConfig?.extra) {
    baseUrl = Constants.expoConfig.extra.EXPO_PUBLIC_API_BASE_URL as string | undefined;
  }
  
  // Debug logging to help troubleshoot
  console.log('[API Config] 🔍 Checking API base URL sources:');
  console.log('[API Config]   process.env.EXPO_PUBLIC_API_BASE_URL:', process.env.EXPO_PUBLIC_API_BASE_URL);
  console.log('[API Config]   Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL:', Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL);
  console.log('[API Config]   Final baseUrl:', baseUrl);
  
  if (!baseUrl) {
    const errorMessage = `
═══════════════════════════════════════════════════════════════
❌ API BASE URL NOT CONFIGURED
═══════════════════════════════════════════════════════════════

EXPO_PUBLIC_API_BASE_URL is required but not set!

Physical devices CANNOT reach localhost. You must set your 
computer's LAN IP address.

To fix:
1. Find your computer's IP address:
   Mac: System Settings > Network > Wi-Fi > Details > IP Address
   Or run: ifconfig | grep "inet " | grep -v 127.0.0.1

2. Update app.json in the "extra" section:
   "extra": {
     "EXPO_PUBLIC_API_BASE_URL": "http://YOUR_IP:3000"
   }
   
   Example: "EXPO_PUBLIC_API_BASE_URL": "http://192.168.1.215:3000"

3. Restart Expo (stop and run 'npx expo start --clear' again)

═══════════════════════════════════════════════════════════════
`;
    console.error(errorMessage);
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not set. See console for setup instructions.');
  }

  // Validate that it's not localhost (won't work on physical devices)
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    console.warn(`
⚠️  WARNING: API base URL contains localhost/127.0.0.1
   This will NOT work on physical devices!
   Current URL: ${baseUrl}
   Use your computer's LAN IP instead (e.g., http://192.168.1.215:3000)
`);
  }

  // Normalize URL (remove trailing slash)
  const normalized = baseUrl.replace(/\/+$/, '');
  console.log('[API Config] ✅ Using API base URL:', normalized);
  return normalized;
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  ENDPOINTS: {
    IDENTIFY_RECORD: '/api/identify-record',
    PING: '/api/ping',
    // Metadata endpoints (for Phase 2.2 resolver)
    DISCOGS_SEARCH: '/api/metadata/discogs/search',
    DISCOGS_RELEASE: '/api/discogs/release', // Existing endpoint
    MUSICBRAINZ_SEARCH: '/api/metadata/musicbrainz/search',
    MUSICBRAINZ_RELEASE: '/api/metadata/musicbrainz/release',
    MUSICBRAINZ_FROM_DISCOGS: '/api/metadata/musicbrainz/from-discogs',
    CAA_RELEASE: '/api/metadata/caa/release',
  },
  TIMEOUT: 90000, // 90 seconds - increased for complex identifications
} as const;

/**
 * Constructs a full API URL from an endpoint
 * Handles leading/trailing slashes correctly
 */
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = API_CONFIG.BASE_URL;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Ensure no double slashes (except after http://)
  const url = `${baseUrl}${normalizedEndpoint}`;
  return url.replace(/([^:]\/)\/+/g, '$1');
};

