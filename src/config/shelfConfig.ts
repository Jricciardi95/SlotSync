/**
 * Central configuration for the ESP32 shelf HTTP client (LAN).
 * Backend identification API uses src/config/api.ts — this is separate.
 */

/** AsyncStorage key for normalized shelf base URL (e.g. http://192.168.1.50) */
export const SHELF_BASE_URL_STORAGE_KEY = '@slotsync/shelf_base_url_v1';

/** Optional default from env (Expo: EXPO_PUBLIC_SHELF_BASE_URL) when storage is empty */
export const SHELF_ENV_BASE_URL = process.env.EXPO_PUBLIC_SHELF_BASE_URL?.trim() ?? '';

/** Default HTTP timeout per shelf request */
export const SHELF_REQUEST_TIMEOUT_MS = 8000;

/** Retries for transient network failures (0 = single attempt) */
export const SHELF_MAX_RETRIES = 2;

/** Delay between retries (ms) */
export const SHELF_RETRY_BASE_DELAY_MS = 400;
