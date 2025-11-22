/**
 * API Configuration for SlotSync
 * 
 * To configure your backend API endpoint:
 * 1. Create a .env file in the project root
 * 2. Add: EXPO_PUBLIC_API_BASE_URL=https://your-api-domain.com
 * 3. Or set it in app.json under expo.extra
 * 
 * For local development:
 * - iOS Simulator: http://localhost:3000
 * - Android Emulator: http://10.0.2.2:3000
 * - Physical device: http://YOUR_COMPUTER_IP:3000
 */

const getApiBaseUrl = (): string => {
  // Check environment variable first
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  // Fallback to localhost for development
  // In production, this should be set via environment variable
  // Using process.env.NODE_ENV as a safer alternative to __DEV__
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev ? 'http://localhost:3000' : 'https://api.slotsync.app';
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  ENDPOINTS: {
    IDENTIFY_RECORD: '/api/identify-record',
  },
  TIMEOUT: 30000, // 30 seconds
} as const;

export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

