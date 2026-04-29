/**
 * High-level shelf lighting API used by screens (Load/Cleanup modes, Record detail, etc.).
 * Talks to ESP32 firmware via GET routes in src/services/shelfApi.
 *
 * Base URL resolution:
 * 1) Settings → persisted shelf URL (AsyncStorage)
 * 2) EXPO_PUBLIC_SHELF_BASE_URL
 * 3) Legacy: `ipAddress` from Unit record (http://that-ip)
 */

import { Alert } from 'react-native';
import {
  shelfBlinkSlot,
  shelfClear,
  shelfDemo,
  shelfGetStatus,
  shelfIdle,
  shelfSelectSlot,
  shelfSelectSlots,
  shelfSetBrightness,
} from './shelfApi/shelfApi';
import { ShelfApiError, ShelfNotConfiguredError } from './shelfApi/types';
import { formatShelfFailureForUser } from './shelfApi/shelfUserMessages';
import { getShelfAutoHighlightEnabled } from './shelfApi/storage';
import { logger } from '../utils/logger';

export type SlotEffect = 'steady' | 'slow_pulse' | 'color_wave';

export type SlotLightParams = {
  /** Legacy per-unit IP; used only if no global shelf URL is configured */
  ipAddress: string;
  slot: number;
  /** All physical slots to highlight in one firmware request (recommended). */
  allSlots?: number[];
  totalSlots?: number;
  color?: string;
  brightness?: number;
  effect?: SlotEffect;
};

export type ClearSlotParams = {
  ipAddress: string;
  /** Ignored by firmware MVP (whole strip clear); kept for call-site compatibility */
  slot?: number;
};

export type GlobalLightingParams = {
  ipAddress: string;
  mode: 'music' | 'idle' | 'off';
  palette?: string[];
  color?: string;
  brightness?: number;
  sensitivity?: number;
  effect?: SlotEffect;
};

const validateSlot = (slot: number, totalSlots?: number) => {
  if (slot < 1) {
    throw new Error('Slot number must be >= 1');
  }
  if (typeof totalSlots === 'number' && slot > totalSlots) {
    throw new Error('Slot number exceeds unit capacity');
  }
};

function alertLightingError(error: unknown, showAlert: boolean) {
  const raw =
    error instanceof ShelfNotConfiguredError
      ? error.message
      : error instanceof ShelfApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';
  const msg =
    error instanceof ShelfNotConfiguredError ? raw : formatShelfFailureForUser(raw);
  logger.debug('[ShelfLighting]', raw);
  if (showAlert) {
    Alert.alert('Shelf lighting', msg);
  }
}

/**
 * Highlight one or more slots (dim shelf + bright selection on firmware).
 */
export const setSlotLight = async (
  {
    ipAddress,
    slot,
    allSlots,
    totalSlots,
  }: SlotLightParams,
  options?: { silent?: boolean }
): Promise<void> => {
  const slots = allSlots?.length ? [...new Set(allSlots)].sort((a, b) => a - b) : [slot];
  slots.forEach((s) => validateSlot(s, totalSlots));
  const primary = slot;
  validateSlot(primary, totalSlots);

  try {
    if (slots.length > 1) {
      await shelfSelectSlots(slots, ipAddress);
    } else {
      await shelfSelectSlot(primary, ipAddress);
    }
  } catch (error) {
    alertLightingError(error, !options?.silent);
    throw error;
  }
};

/**
 * Turn shelf off (firmware clears entire strip — no per-slot clear on ESP32 MVP).
 */
export const clearSlotLight = async (
  { ipAddress }: ClearSlotParams,
  options?: { silent?: boolean }
): Promise<void> => {
  try {
    await shelfClear(ipAddress);
  } catch (error) {
    alertLightingError(error, !options?.silent);
    throw error;
  }
};

/**
 * Global modes — mapped to firmware where possible.
 */
export const setGlobalLighting = async ({
  ipAddress,
  mode,
}: GlobalLightingParams): Promise<void> => {
  try {
    if (mode === 'idle') {
      await shelfIdle(ipAddress);
      return;
    }
    if (mode === 'off') {
      await shelfClear(ipAddress);
      return;
    }
    // music — firmware uses separate flag; MVP: demo as “active” visual
    await shelfDemo(ipAddress);
  } catch (error) {
    alertLightingError(error, true);
    throw error;
  }
};

/** Fire-and-forget highlight when opening an album (no alert on failure). */
export const highlightAlbumSlots = async (
  slotNumbers: number[],
  unitIpAddress?: string | null
): Promise<void> => {
  if (!slotNumbers.length) return;
  if (!(await getShelfAutoHighlightEnabled())) {
    logger.debug('[ShelfLighting] Auto highlight disabled in Settings');
    return;
  }
  const sorted = [...new Set(slotNumbers)].filter((n) => n >= 1).sort((a, b) => a - b);
  if (!sorted.length) return;
  try {
    await setSlotLight(
      {
        ipAddress: unitIpAddress ?? '',
        slot: sorted[0],
        allSlots: sorted,
      },
      { silent: true }
    );
  } catch {
    /* logged in setSlotLight */
  }
};

export { shelfGetStatus, shelfIdle, shelfClear, shelfDemo, shelfBlinkSlot, shelfSetBrightness };
