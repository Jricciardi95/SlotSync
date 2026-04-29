import {
  SHELF_MAX_RETRIES,
  SHELF_REQUEST_TIMEOUT_MS,
  SHELF_RETRY_BASE_DELAY_MS,
} from '../../config/shelfConfig';
import { ShelfApiError } from './types';
import { markShelfAttempt, markShelfFailure, noteShelfResponseOk } from './connectionState';
import { logger } from '../../utils/logger';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function isProbablyJson(res: Response) {
  const ct = res.headers.get('content-type');
  return !ct || ct.includes('json');
}

/**
 * GET JSON from shelf with timeout + retries. Updates connection state on success/failure.
 */
export async function shelfGetJson<T extends object>(
  baseUrl: string,
  pathWithQuery: string,
  options?: { timeoutMs?: number; retries?: number; trackStatus?: boolean }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? SHELF_REQUEST_TIMEOUT_MS;
  const retries = options?.retries ?? SHELF_MAX_RETRIES;
  const url = `${baseUrl}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  let lastErr: Error | null = null;

  markShelfAttempt();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(SHELF_RETRY_BASE_DELAY_MS * attempt);
      }
      const res = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
      const text = await res.text();
      if (!res.ok) {
        throw new ShelfApiError(
          `Shelf HTTP ${res.status}`,
          res.status,
          text.slice(0, 200)
        );
      }
      if (!isProbablyJson(res)) {
        throw new ShelfApiError('Shelf returned non-JSON response', res.status, text.slice(0, 200));
      }
      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        throw new ShelfApiError('Invalid JSON from shelf', res.status, text.slice(0, 200));
      }
      if (options?.trackStatus !== false) {
        noteShelfResponseOk(data);
      }
      return data;
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message || String(e);
      if (e?.name === 'AbortError') {
        lastErr = new ShelfApiError('Shelf request timed out');
      }
      logger.debug(`[shelf] GET attempt ${attempt + 1}/${retries + 1} failed:`, msg);
    }
  }

  const finalMsg = lastErr?.message ?? 'Shelf request failed';
  markShelfFailure(finalMsg);
  if (lastErr instanceof ShelfApiError) {
    throw lastErr;
  }
  throw new ShelfApiError(finalMsg);
}
