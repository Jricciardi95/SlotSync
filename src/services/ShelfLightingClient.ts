import { Alert } from 'react-native';

type SlotEffect = 'steady' | 'slow_pulse' | 'color_wave';

type SlotLightParams = {
  ipAddress: string;
  slot: number;
  totalSlots?: number;
  color?: string;
  brightness?: number;
  effect?: SlotEffect;
};

type ClearSlotParams = {
  ipAddress: string;
  slot: number;
};

type GlobalLightingParams = {
  ipAddress: string;
  mode: 'music' | 'idle' | 'off';
  palette?: string[];
  color?: string;
  brightness?: number;
  sensitivity?: number;
  effect?: SlotEffect;
};

const request = async (
  url: string,
  payload: Record<string, unknown>
): Promise<void> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn('Shelf lighting request failed', error);
    Alert.alert(
      'Lighting command failed',
      'Please check the unit connection and try again.'
    );
    throw error;
  }
};

const validateSlot = (slot: number, totalSlots?: number) => {
  if (slot < 1) {
    throw new Error('Slot number must be >= 1');
  }
  if (typeof totalSlots === 'number' && slot > totalSlots) {
    throw new Error('Slot number exceeds unit capacity');
  }
};

export const setSlotLight = async ({
  ipAddress,
  slot,
  totalSlots,
  color = '#FFFFFF',
  brightness = 0.9,
  effect = 'steady',
}: SlotLightParams): Promise<void> => {
  validateSlot(slot, totalSlots);
  await request(`http://${ipAddress}/led/slot`, {
    slot,
    color,
    brightness,
    effect,
  });
};

export const clearSlotLight = async ({
  ipAddress,
  slot,
}: ClearSlotParams): Promise<void> => {
  validateSlot(slot);
  await request(`http://${ipAddress}/led/slot/clear`, { slot });
};

export const setGlobalLighting = async ({
  ipAddress,
  mode,
  palette,
  color,
  brightness,
  sensitivity,
  effect,
}: GlobalLightingParams): Promise<void> => {
  await request(`http://${ipAddress}/led/global`, {
    mode,
    palette,
    color,
    brightness,
    sensitivity,
    effect,
  });
};

