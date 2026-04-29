/**
 * Optional shared API key for /api/* (private beta).
 *
 * Set SLOTSYNC_API_KEY in the server environment. When unset, middleware is a no-op
 * (local dev and tests keep working).
 *
 * Client sends: X-SlotSync-Api-Key: <same value> (from EXPO_PUBLIC_SLOTSYNC_API_KEY).
 */

function getProvidedKey(req) {
  const header = req.get('x-slotsync-api-key');
  if (header && header.trim()) return header.trim();
  const auth = req.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  return '';
}

function slotsyncApiKey(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const expected = process.env.SLOTSYNC_API_KEY?.trim();
  if (!expected) {
    return next();
  }

  const got = getProvidedKey(req);
  if (got === expected) {
    return next();
  }

  return res.status(401).json({
    ok: false,
    error: 'unauthorized',
    message: 'Missing or invalid API key. Set X-SlotSync-Api-Key to match server SLOTSYNC_API_KEY.',
  });
}

module.exports = { slotsyncApiKey };
