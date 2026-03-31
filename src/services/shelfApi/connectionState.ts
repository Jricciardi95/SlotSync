import type { ShelfStatusJson } from './types';

type Listener = () => void;

let lastStatus: ShelfStatusJson | null = null;
let lastError: string | null = null;
let lastSuccessAt: number | null = null;
let lastAttemptAt: number | null = null;
const listeners = new Set<Listener>();

export function subscribeShelfConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function getShelfConnectionSnapshot() {
  return {
    lastStatus,
    lastError,
    lastSuccessAt,
    lastAttemptAt,
    isHealthy: lastSuccessAt != null && (lastError == null || Date.now() - lastSuccessAt < 60_000),
  };
}

export function markShelfAttempt() {
  lastAttemptAt = Date.now();
  emit();
}

export function noteShelfResponseOk(data: unknown) {
  lastError = null;
  lastSuccessAt = Date.now();
  if (data && typeof data === 'object' && ('mode' in data || 'max_slot' in data)) {
    lastStatus = data as ShelfStatusJson;
  }
  emit();
}

export function markShelfFailure(message: string) {
  lastError = message;
  emit();
}
