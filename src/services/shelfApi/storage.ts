import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SHELF_BASE_URL_STORAGE_KEY,
  SHELF_ENV_BASE_URL,
} from '../../config/shelfConfig';

/**
 * Normalize user input to a fetch-safe origin with no trailing slash.
 * Accepts: 192.168.1.10 | http://192.168.1.10 | http://192.168.1.10:80
 */
export function normalizeShelfBaseUrl(input: string): string {
  let s = input.trim();
  if (!s) {
    throw new Error('Shelf URL is empty');
  }
  s = s.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('Only http and https are supported');
    }
    // Drop path/query for shelf firmware (served at root)
    const origin = `${u.protocol}//${u.host}`;
    return origin.replace(/\/+$/, '');
  } catch {
    throw new Error('Invalid shelf URL');
  }
}

export async function getStoredShelfBaseUrl(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(SHELF_BASE_URL_STORAGE_KEY);
  if (raw?.trim()) {
    try {
      return normalizeShelfBaseUrl(raw);
    } catch {
      return null;
    }
  }
  if (SHELF_ENV_BASE_URL) {
    try {
      return normalizeShelfBaseUrl(SHELF_ENV_BASE_URL);
    } catch {
      return null;
    }
  }
  return null;
}

export async function setStoredShelfBaseUrl(url: string): Promise<void> {
  const normalized = normalizeShelfBaseUrl(url);
  await AsyncStorage.setItem(SHELF_BASE_URL_STORAGE_KEY, normalized);
}

export async function clearStoredShelfBaseUrl(): Promise<void> {
  await AsyncStorage.removeItem(SHELF_BASE_URL_STORAGE_KEY);
}

/**
 * Resolve base URL for a request.
 * Order: stored/env → optional per-unit IP (legacy Stands `Unit.ipAddress`).
 */
export async function resolveShelfBaseUrl(unitIpAddress?: string | null): Promise<string | null> {
  const stored = await getStoredShelfBaseUrl();
  if (stored) return stored;
  const ip = unitIpAddress?.trim();
  if (ip) {
    try {
      return normalizeShelfBaseUrl(ip);
    } catch {
      return null;
    }
  }
  return null;
}
