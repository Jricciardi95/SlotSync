/**
 * API Configuration for SlotSync
 * 
 * CRITICAL: Robust base URL resolver with health-check-based selection
 * 
 * Selection process:
 * 1. Build candidates in order: hostUri inferred -> app.json extra -> process.env
 * 2. Test all candidates in parallel with GET {baseUrl}/health (2s timeout each)
 * 3. Choose the first candidate that passes health check (by priority order)
 * 4. If process.env is set but fails health, log it as stale and ignore it
 * 5. Cache the chosen baseUrl for the app session to avoid repeated health checks
 * 
 * Physical devices CANNOT reach localhost - they need your computer's LAN IP.
 * This resolver automatically infers the correct IP from Expo's hostUri when available.
 * 
 * Performance: Parallel health checks reduce startup time from O(n * 2s) to O(2s max).
 */

import Constants from 'expo-constants';
import { logger } from '../utils/logger';

/**
 * Extracts host from Expo hostUri and builds backend URL
 * Example: "192.168.1.60:8082" -> "http://192.168.1.60:3000"
 */
const inferBaseUrlFromHostUri = (hostUri: string | undefined | null): string | null => {
  if (!hostUri) return null;
  
  try {
    // hostUri format: "192.168.1.60:8082" or "exp://192.168.1.60:8082"
    // Extract just the host:port part
    const match = hostUri.match(/(?:exp\+?:\/\/)?([^/]+)/);
    if (!match || !match[1]) return null;
    
    const hostPort = match[1];
    // Split host and port
    const [host] = hostPort.split(':');
    if (!host) return null;
    
    // Build backend URL using same host, port 3000
    const inferred = `http://${host}:3000`;
    logger.debug('[API Config] 🔍 Inferred from hostUri:', {
      hostUri,
      extractedHost: host,
      inferredUrl: inferred,
    });
    return inferred;
  } catch (error) {
    logger.warn('[API Config] ⚠️ Failed to infer from hostUri:', error);
    return null;
  }
};

/**
 * Validates that a URL is not localhost (won't work on physical devices)
 */
const isValidUrlForPhysicalDevice = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('localhost') || url.includes('127.0.0.1')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
};

/**
 * Health check result
 */
export type HealthCheckResult = {
  success: boolean;
  url: string;
  elapsedMs: number;
  error?: string;
};

/**
 * Performs a quick health check on the backend server (internal)
 * @param baseUrl - Base URL to check
 * @param timeoutMs - Timeout in milliseconds (default: 2000)
 * @returns Health check result
 */
const performHealthCheck = async (
  baseUrl: string,
  timeoutMs: number = 2000
): Promise<HealthCheckResult> => {
  const healthUrl = `${baseUrl}/health`;
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;
    
    if (response.ok) {
      return { success: true, url: baseUrl, elapsedMs };
    } else {
      return {
        success: false,
        url: baseUrl,
        elapsedMs,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error?.message || 'Unknown error';
    return {
      success: false,
      url: baseUrl,
      elapsedMs,
      error: errorMessage,
    };
  }
};

// Session cache for resolved base URL
let cachedBaseUrl: string | null = null;
let resolutionPromise: Promise<string> | null = null;

/**
 * Resolves the API base URL by testing candidates with health checks
 * Caches the result for the app session to avoid repeated health checks
 * 
 * Candidate order:
 * 1. hostUri inferred
 * 2. app.json extra (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL)
 * 3. process.env (EXPO_PUBLIC_API_BASE_URL)
 * 
 * @returns Promise resolving to the first working base URL
 */
export const resolveApiBaseUrl = async (): Promise<string> => {
  // Return cached value if available
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  
  // If resolution is in progress, wait for it
  if (resolutionPromise) {
    return resolutionPromise;
  }
  
  // Start new resolution
  resolutionPromise = (async () => {
    logger.debug('[API Config] 🔍 Resolving API base URL with health checks...');
    
    // Build candidates in order: hostUri -> app.json -> process.env
    const candidates: Array<{ source: string; value: string }> = [];
    
    // 1. Infer from hostUri (multiple sources)
    const hostUriSources = [
      Constants.expoConfig?.hostUri,
      Constants.manifest2?.extra?.expoClient?.hostUri,
      (Constants as any).manifest?.hostUri, // Legacy format
    ].filter(Boolean);
    
    for (const hostUri of hostUriSources) {
      const inferred = inferBaseUrlFromHostUri(hostUri);
      if (inferred && isValidUrlForPhysicalDevice(inferred)) {
        candidates.push({ source: `hostUri (${hostUri})`, value: inferred });
        break; // Use first valid hostUri
      }
    }
    
    // 2. app.json extra section
    const configUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL as string | undefined;
    if (configUrl && isValidUrlForPhysicalDevice(configUrl)) {
      candidates.push({ source: 'Constants.expoConfig.extra.EXPO_PUBLIC_API_BASE_URL', value: configUrl });
    }
    
    // 3. process.env
    const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (envUrl && isValidUrlForPhysicalDevice(envUrl)) {
      candidates.push({ source: 'process.env.EXPO_PUBLIC_API_BASE_URL', value: envUrl });
    }
    
    // Log all candidates
    logger.debug('[API Config] 🔍 Testing candidates (in order):');
    candidates.forEach((candidate, index) => {
      logger.debug(`[API Config]   ${index + 1}. ${candidate.source}: ${candidate.value}`);
    });
    
    if (candidates.length === 0) {
      const errorMessage = `
═══════════════════════════════════════════════════════════════
❌ API BASE URL NOT CONFIGURED
═══════════════════════════════════════════════════════════════

No valid API base URL candidates found!

Physical devices CANNOT reach localhost. You must set your 
computer's LAN IP address.

To fix:
1. Find your computer's IP address:
   Mac: System Settings > Network > Wi-Fi > Details > IP Address
   Or run: ifconfig | grep "inet " | grep -v 127.0.0.1

2. Option A - Update app.json in the "extra" section:
   "extra": {
     "EXPO_PUBLIC_API_BASE_URL": "http://YOUR_IP:3000"
   }

3. Option B - Set environment variable:
   export EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:3000

4. Restart Expo (stop and run 'npx expo start --clear' again)

Note: If using Expo dev client, the URL may be automatically
inferred from the dev server's IP address (hostUri).

═══════════════════════════════════════════════════════════════
`;
      logger.error(errorMessage);
      throw new Error('EXPO_PUBLIC_API_BASE_URL is not set. See console for setup instructions.');
    }
    
    // Test all candidates in parallel for faster startup
    logger.debug(`[API Config] 🏥 Testing ${candidates.length} candidates in parallel...`);
    const healthCheckPromises = candidates.map((candidate) =>
      performHealthCheck(candidate.value, 2000).then((result) => ({
        candidate,
        result,
      }))
    );
    
    const healthCheckResults = await Promise.allSettled(healthCheckPromises);
    
    // Find the first successful candidate in priority order
    let selectedBaseUrl: string | null = null;
    let selectedSource: string | null = null;
    let selectedIndex: number = -1;
    let staleEnvUrl: string | null = null;
    
    // Process results in priority order (maintain original candidate order)
    for (let i = 0; i < healthCheckResults.length; i++) {
      const settled = healthCheckResults[i];
      const candidate = candidates[i];
      
      if (settled.status === 'fulfilled') {
        const { result } = settled.value;
        
        if (result.success) {
          // Found first healthy candidate in priority order
          selectedBaseUrl = candidate.value;
          selectedSource = candidate.source;
          selectedIndex = i;
          logger.debug(`[API Config] ✅ Health check passed: ${candidate.value} (${result.elapsedMs}ms)`);
          break; // Stop at first successful candidate in priority order
        } else {
          logger.debug(`[API Config] ⚠️  Health check failed: ${candidate.value} (${result.elapsedMs}ms, error: ${result.error})`);
          
          // Special handling for stale process.env
          if (candidate.source === 'process.env.EXPO_PUBLIC_API_BASE_URL') {
            staleEnvUrl = candidate.value;
            logger.warn(`[API Config] ⚠️  STALE: process.env.EXPO_PUBLIC_API_BASE_URL is set but backend is unreachable`);
            logger.warn(`[API Config]   Stale URL: ${staleEnvUrl}`);
            logger.warn(`[API Config]   This is likely an old IP address. Ignoring and trying next candidate.`);
          }
        }
      } else {
        // Promise rejected (shouldn't happen with performHealthCheck, but handle gracefully)
        logger.warn(`[API Config] ⚠️  Health check promise rejected for ${candidate.value}:`, settled.reason);
      }
    }
    
    if (selectedBaseUrl) {
      logger.debug(`[API Config] ✅ Selected from ${selectedSource}: ${selectedBaseUrl} (priority ${selectedIndex + 1}/${candidates.length})`);
    }
    
    if (!selectedBaseUrl) {
      const errorMessage = `
═══════════════════════════════════════════════════════════════
❌ NO WORKING API BASE URL FOUND
═══════════════════════════════════════════════════════════════

All candidates failed health checks!

Tested candidates:
${candidates.map((c, i) => `  ${i + 1}. ${c.source}: ${c.value}`).join('\n')}

${staleEnvUrl ? `⚠️  Note: process.env.EXPO_PUBLIC_API_BASE_URL=${staleEnvUrl} is stale (backend unreachable)\n` : ''}
Troubleshooting:
1. Ensure backend server is running: node server-hybrid.js
2. Check backend is accessible from your device
3. Verify all candidates are correct IP addresses
4. Check firewall settings

═══════════════════════════════════════════════════════════════
`;
      logger.error(errorMessage);
      throw new Error('No working API base URL found. All health checks failed. See console for details.');
    }
    
    // Normalize URL (remove trailing slash)
    const normalized = selectedBaseUrl.replace(/\/+$/, '');
    
    // Warn if localhost (shouldn't happen after validation, but double-check)
    if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
      logger.warn(`[API Config] ⚠️  WARNING: API base URL contains localhost/127.0.0.1`);
      logger.warn(`[API Config]   This will NOT work on physical devices!`);
      logger.warn(`[API Config]   Current URL: ${normalized}`);
      logger.warn(`[API Config]   Use your computer's LAN IP instead (e.g., http://192.168.1.60:3000)`);
    }
    
    // Cache the result
    cachedBaseUrl = normalized;
    logger.debug(`[API Config] 💾 Cached base URL for session: ${cachedBaseUrl}`);
    
    return normalized;
  })();
  
  try {
    const result = await resolutionPromise;
    return result;
  } finally {
    // Clear the promise so we can retry if needed
    resolutionPromise = null;
  }
};

/**
 * Gets the cached API base URL (synchronous)
 * Returns cached value if available, otherwise throws error
 * Use resolveApiBaseUrl() to initialize the cache first
 */
export const getApiBaseUrl = (): string => {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  
  // If not cached, this is an error - should call resolveApiBaseUrl() first
  throw new Error(
    'API base URL not resolved. Call resolveApiBaseUrl() first to initialize. ' +
    'This should be done on app startup.'
  );
};

/**
 * Performs a health check on the backend server
 * @param baseUrlOrTimeout - Optional base URL to check, or timeout in ms if number
 * @param timeoutMs - Timeout in milliseconds (default: 2000)
 * @returns Health check result
 */
export const checkBackendHealth = async (
  baseUrlOrTimeout?: string | number,
  timeoutMs: number = 2000
): Promise<HealthCheckResult> => {
  // Handle overloaded signature: checkBackendHealth(baseUrl, timeout) or checkBackendHealth(timeout)
  let baseUrl: string;
  let actualTimeout: number;
  
  if (typeof baseUrlOrTimeout === 'string') {
    // Called as checkBackendHealth(baseUrl, timeout)
    baseUrl = baseUrlOrTimeout;
    actualTimeout = timeoutMs;
  } else {
    // Called as checkBackendHealth(timeout) - use cached base URL
    baseUrl = getApiBaseUrl();
    actualTimeout = typeof baseUrlOrTimeout === 'number' ? baseUrlOrTimeout : timeoutMs;
  }
  
  return performHealthCheck(baseUrl, actualTimeout);
};

// Initialize base URL on module load (async, but don't block)
// This will cache the result for the session
let initializationStarted = false;
export const initializeApiBaseUrl = async (): Promise<void> => {
  if (initializationStarted) {
    return;
  }
  initializationStarted = true;
  try {
    await resolveApiBaseUrl();
  } catch (error) {
    logger.error('[API Config] ❌ Failed to initialize API base URL:', error);
    // Don't throw - allow app to continue, but API calls will fail
  }
};

// Auto-initialize in development (non-blocking)
if (__DEV__) {
  initializeApiBaseUrl().catch(() => {
    // Silently fail - will be retried when needed
  });
}

export const API_CONFIG = {
  get BASE_URL() {
    // Always use cached value (must be initialized first)
    return getApiBaseUrl();
  },
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
 * Uses ONLY the resolved baseUrl (cached)
 */
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = API_CONFIG.BASE_URL;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Ensure no double slashes (except after http://)
  const url = `${baseUrl}${normalizedEndpoint}`;
  return url.replace(/([^:]\/)\/+/g, '$1');
};
