/**
 * PR7: LED Control Utility
 * 
 * Future-proof event contract for LED slot lighting.
 * For now, only logs and updates UI state; later will send to firmware.
 */

import { logger } from './logger';

export type LightMode = 'on' | 'off' | 'blink' | 'pulse' | 'highlight';

export interface LightSlotEvent {
  unitId: string;
  slotId: string;
  slotNumber: number;
  mode: LightMode;
  color?: string; // Optional color (e.g., 'red', 'green', 'blue', hex code)
  duration?: number; // Optional duration in ms
}

/**
 * Emit a light slot event
 * 
 * For now, this only logs the event and updates UI state.
 * Later, this will send commands to the firmware via BLE/WiFi.
 * 
 * @param unitId - Unit (shelf) ID
 * @param slotId - Slot ID
 * @param slotNumber - Slot number (for logging)
 * @param mode - Light mode
 * @param options - Optional color and duration
 */
export const emitLightSlot = (
  unitId: string,
  slotId: string,
  slotNumber: number,
  mode: LightMode,
  options?: {
    color?: string;
    duration?: number;
  }
): void => {
  const event: LightSlotEvent = {
    unitId,
    slotId,
    slotNumber,
    mode,
    color: options?.color,
    duration: options?.duration,
  };

  // PR7: For now, just log the event
  logger.debug('[LED] Emitting light slot event:', {
    unitId,
    slotId,
    slotNumber,
    mode,
    color: event.color,
    duration: event.duration,
  });

  // TODO: Future implementation
  // - Send BLE command to unit firmware
  // - Or send WiFi command to unit IP address
  // - Handle response/acknowledgment
  // - Update UI state based on hardware response
};

/**
 * Turn on a slot light (highlight)
 */
export const lightSlotOn = (
  unitId: string,
  slotId: string,
  slotNumber: number,
  color?: string
): void => {
  emitLightSlot(unitId, slotId, slotNumber, 'on', { color });
};

/**
 * Turn off a slot light
 */
export const lightSlotOff = (
  unitId: string,
  slotId: string,
  slotNumber: number
): void => {
  emitLightSlot(unitId, slotId, slotNumber, 'off');
};

/**
 * Blink a slot light (for attention)
 */
export const lightSlotBlink = (
  unitId: string,
  slotId: string,
  slotNumber: number,
  color?: string,
  duration?: number
): void => {
  emitLightSlot(unitId, slotId, slotNumber, 'blink', { color, duration });
};

/**
 * Pulse a slot light (smooth fade in/out)
 */
export const lightSlotPulse = (
  unitId: string,
  slotId: string,
  slotNumber: number,
  color?: string,
  duration?: number
): void => {
  emitLightSlot(unitId, slotId, slotNumber, 'pulse', { color, duration });
};

/**
 * Highlight a slot (on with default highlight color)
 */
export const lightSlotHighlight = (
  unitId: string,
  slotId: string,
  slotNumber: number
): void => {
  emitLightSlot(unitId, slotId, slotNumber, 'highlight', { color: '#00ff00' });
};


