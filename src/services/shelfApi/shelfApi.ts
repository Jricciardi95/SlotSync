/**
 * Typed helpers for each ESP32 shelf route (GET + query params as in firmware).
 */

import { resolveShelfBaseUrl } from './storage';
import { shelfGetJson } from './http';
import type { ShelfOkJson, ShelfStatusJson } from './types';
import { ShelfNotConfiguredError } from './types';

async function base(unitIp?: string | null): Promise<string> {
  const b = await resolveShelfBaseUrl(unitIp);
  if (!b) throw new ShelfNotConfiguredError();
  return b;
}

function q(params: Record<string, string | number | undefined>): string {
  const e = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined) return;
    e.set(k, String(v));
  });
  const s = e.toString();
  return s ? `?${s}` : '';
}

export async function shelfGetStatus(unitIp?: string | null): Promise<ShelfStatusJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfStatusJson>(b, '/status');
}

export async function shelfIdle(unitIp?: string | null): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(b, '/idle');
}

export async function shelfClear(unitIp?: string | null): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(b, '/clear');
}

export async function shelfDemo(unitIp?: string | null): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(b, '/demo');
}

export async function shelfSelectSlot(
  slot: number,
  unitIp?: string | null
): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(b, `/slot${q({ num: slot })}`);
}

export async function shelfSelectSlots(
  slots: number[],
  unitIp?: string | null
): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  const nums = slots.filter((n) => n >= 1).join(',');
  return shelfGetJson<ShelfOkJson>(b, `/slots${q({ nums })}`);
}

export async function shelfBlinkSlot(
  slot: number,
  unitIp?: string | null
): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(b, `/blink${q({ num: slot })}`);
}

export async function shelfSetBrightness(
  value: number,
  unitIp?: string | null
): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return shelfGetJson<ShelfOkJson>(b, `/brightness${q({ value: v })}`);
}

export async function shelfSetIdleColor(
  rgb: { r: number; g: number; b: number },
  unitIp?: string | null
): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(
    b,
    `/idlecolor${q({ r: rgb.r, g: rgb.g, b: rgb.b })}`
  );
}

export async function shelfSetSelectedColor(
  rgb: { r: number; g: number; b: number },
  unitIp?: string | null
): Promise<ShelfOkJson> {
  const b = await base(unitIp);
  return shelfGetJson<ShelfOkJson>(
    b,
    `/selectedcolor${q({ r: rgb.r, g: rgb.g, b: rgb.b })}`
  );
}
