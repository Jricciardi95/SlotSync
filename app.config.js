/**
 * Dynamic Expo config — keeps secrets and LAN URLs out of production defaults.
 *
 * | Variable | Local dev | EAS preview | EAS production |
 * |----------|-----------|-------------|----------------|
 * | EXPO_PUBLIC_APP_ENV | development (or unset) | preview | production |
 * | EXPO_PUBLIC_API_BASE_URL | .env or hostUri inference | staging https URL | prod https URL |
 * | EXPO_PUBLIC_SLOTSYNC_API_KEY | unset locally | same as server SLOTSYNC_API_KEY | same |
 * | EXPO_PUBLIC_API_KEY | alias for above | optional | optional |
 * | EXPO_PUBLIC_SHELF_BASE_URL | optional .env | optional | optional |
 * | EXPO_PUBLIC_SENTRY_DSN | optional | recommended | required for crashes |
 *
 * Repo defaults: empty API/shelf strings → dev relies on Expo hostUri + local .env.
 * Production EAS builds MUST set EXPO_PUBLIC_API_BASE_URL (https) or the app cannot resolve an API.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('./app.json');

module.exports = () => {
  const expo = JSON.parse(JSON.stringify(appJson.expo));
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? expo.extra?.EXPO_PUBLIC_APP_ENV ?? 'development';

  const apiFromBuild = process.env.EXPO_PUBLIC_API_BASE_URL;
  const shelfFromBuild = process.env.EXPO_PUBLIC_SHELF_BASE_URL;
  const sentryFromBuild = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const slotsyncKeyFromBuild = process.env.EXPO_PUBLIC_SLOTSYNC_API_KEY;
  const apiKeyAliasFromBuild = process.env.EXPO_PUBLIC_API_KEY;

  expo.extra = {
    ...(expo.extra || {}),
    EXPO_PUBLIC_APP_ENV: appEnv,
    EXPO_PUBLIC_API_BASE_URL:
      apiFromBuild !== undefined ? apiFromBuild : expo.extra?.EXPO_PUBLIC_API_BASE_URL ?? '',
    EXPO_PUBLIC_SHELF_BASE_URL:
      shelfFromBuild !== undefined ? shelfFromBuild : expo.extra?.EXPO_PUBLIC_SHELF_BASE_URL ?? '',
    EXPO_PUBLIC_SENTRY_DSN:
      sentryFromBuild !== undefined ? sentryFromBuild : expo.extra?.EXPO_PUBLIC_SENTRY_DSN ?? '',
    EXPO_PUBLIC_SLOTSYNC_API_KEY:
      slotsyncKeyFromBuild !== undefined
        ? slotsyncKeyFromBuild
        : expo.extra?.EXPO_PUBLIC_SLOTSYNC_API_KEY ?? '',
    EXPO_PUBLIC_API_KEY:
      apiKeyAliasFromBuild !== undefined ? apiKeyAliasFromBuild : expo.extra?.EXPO_PUBLIC_API_KEY ?? '',
  };

  return { expo };
};
