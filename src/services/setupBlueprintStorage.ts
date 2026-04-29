import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../utils/id';

export type SetupShapeType = 'shelf' | 'turntable' | 'speaker' | 'label';
export type SetupPositionPreset = 'top_left' | 'top_right' | 'middle' | 'bottom_left' | 'bottom_right';

export type SetupShape = {
  id: string;
  type: SetupShapeType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  linkedUnitId?: string;
  metadata?: Record<string, unknown>;
};

const KEY = 'slotsync_setup_blueprint_v1';

const PRESET_POSITIONS: Record<SetupPositionPreset, { x: number; y: number }> = {
  top_left: { x: 20, y: 20 },
  top_right: { x: 210, y: 20 },
  middle: { x: 115, y: 160 },
  bottom_left: { x: 20, y: 290 },
  bottom_right: { x: 210, y: 290 },
};

export function createShapeDraft(
  type: SetupShapeType,
  name: string,
  preset: SetupPositionPreset,
  linkedUnitId?: string,
  metadata?: Record<string, unknown>
): SetupShape {
  const base = PRESET_POSITIONS[preset];
  const defaults =
    type === 'shelf'
      ? { width: 150, height: 60 }
      : type === 'turntable'
      ? { width: 110, height: 110 }
      : type === 'speaker'
      ? { width: 70, height: 100 }
      : { width: 140, height: 40 };
  return {
    id: generateId('shape'),
    type,
    name,
    x: base.x,
    y: base.y,
    width: defaults.width,
    height: defaults.height,
    linkedUnitId,
    metadata,
  };
}

export async function loadSetupBlueprint(): Promise<SetupShape[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSetupBlueprint(shapes: SetupShape[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(shapes));
}
