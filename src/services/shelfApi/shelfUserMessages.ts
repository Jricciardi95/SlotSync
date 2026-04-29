/**
 * Short, user-facing explanations for shelf HTTP failures (banner / alerts).
 */

export function formatShelfFailureForUser(lastError: string): string {
  const s = lastError.toLowerCase();
  if (s.includes('not configured') || s.includes('shelf base url')) {
    return 'Set the shelf address under Settings → Shelf connection.';
  }
  if (s.includes('timeout') || s.includes('timed out') || s.includes('abort')) {
    return 'The shelf did not respond in time. Check Wi‑Fi, power, and the address in Settings.';
  }
  if (s.includes('non-json') || s.includes('invalid json')) {
    return 'The device at that address is not responding like a SlotSync shelf. Check the URL.';
  }
  if (s.includes('http 4') || s.includes('http 5') || s.includes('shelf http')) {
    return 'The shelf returned an error. Confirm the ESP32 firmware is running and the URL is correct.';
  }
  if (s.includes('network') || s.includes('failed to fetch') || s.includes('network request failed')) {
    return 'Could not reach the shelf on your network. Same Wi‑Fi as the phone? Shelf powered on?';
  }
  return lastError.length > 140 ? `${lastError.slice(0, 137)}…` : lastError;
}
