import Constants from 'expo-constants';

export type AppEnv = 'development' | 'preview' | 'production';

/**
 * Build/runtime environment from EAS `env.EXPO_PUBLIC_APP_ENV` (see eas.json).
 * Local `expo start` defaults to development when unset.
 */
export function getAppEnv(): AppEnv {
  const fromExtra = Constants.expoConfig?.extra?.EXPO_PUBLIC_APP_ENV as string | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_APP_ENV;
  const raw = (fromEnv ?? fromExtra ?? '').toLowerCase().trim();
  if (raw === 'production') return 'production';
  if (raw === 'preview') return 'preview';
  if (raw === 'development') return 'development';
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

export function isProductionBuild(): boolean {
  return getAppEnv() === 'production';
}
