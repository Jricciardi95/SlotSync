import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { getAllUnits, getUnitAssignedRecords } from '../data/repository';
import { RecordModel, Unit } from '../data/types';
import { clearSlotLight, setSlotLight, shelfIdle } from '../services/ShelfLightingClient';
import { getCoverImageUri } from '../utils/imageSelection';
import { logger } from '../utils/logger';

type Props = NativeStackScreenProps<LibraryStackParamList, 'CloserLook'>;
type ShelfRecord = RecordModel & { slotNumbers: number[]; firstSlot: number };

const ITEM_WIDTH = 96;
const ITEM_GAP = 12;
const SNAP = ITEM_WIDTH + ITEM_GAP;
const LIGHT_DEBOUNCE_MS = 150;

export const CloserLookScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [records, setRecords] = useState<ShelfRecord[]>([]);
  const [centeredIndex, setCenteredIndex] = useState(0);
  const [shelfUnavailable, setShelfUnavailable] = useState(false);
  const lightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentSlotRef = useRef<number | null>(null);
  const initialUnitId = (navigation as any)?.params?.unitId as string | undefined;

  const loadUnits = useCallback(async () => {
    const all = await getAllUnits();
    setUnits(all);
  }, []);

  const loadUnitRecords = useCallback(async (unit: Unit) => {
    const assigned = await getUnitAssignedRecords(unit.id);
    setRecords(assigned);
    setCenteredIndex(0);
    lastSentSlotRef.current = null;
  }, []);

  useEffect(() => {
    loadUnits().catch((e) => logger.error('[CloserLook] loadUnits failed', e));
  }, [loadUnits]);

  useEffect(() => {
    if (!initialUnitId || !units.length || selectedUnit) return;
    const found = units.find((u) => u.id === initialUnitId);
    if (found) setSelectedUnit(found);
  }, [initialUnitId, units, selectedUnit]);

  useEffect(() => {
    if (!selectedUnit) return;
    loadUnitRecords(selectedUnit).catch((e) => logger.error('[CloserLook] loadUnitRecords failed', e));
  }, [selectedUnit, loadUnitRecords]);

  const centeredRecord = records[centeredIndex] ?? null;

  useEffect(() => {
    if (!selectedUnit || !centeredRecord) return;
    const slot = centeredRecord.firstSlot;
    if (!slot || lastSentSlotRef.current === slot) return;
    if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
    lightTimerRef.current = setTimeout(async () => {
      try {
        await setSlotLight(
          {
            ipAddress: selectedUnit.ipAddress,
            slot,
            allSlots: centeredRecord.slotNumbers,
            totalSlots: selectedUnit.totalSlots,
          },
          { silent: true }
        );
        lastSentSlotRef.current = slot;
      } catch (e) {
        setShelfUnavailable(true);
      }
    }, LIGHT_DEBOUNCE_MS);

    return () => {
      if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
    };
  }, [centeredRecord, selectedUnit]);

  useEffect(() => {
    return () => {
      if (lightTimerRef.current) clearTimeout(lightTimerRef.current);
      if (!selectedUnit || !centeredRecord) return;
      clearSlotLight({ ipAddress: selectedUnit.ipAddress }, { silent: true }).catch(() => {
        shelfIdle(selectedUnit.ipAddress).catch(() => {
          /* noop */
        });
      });
    };
  }, [selectedUnit, centeredRecord]);

  const sidePadding = useMemo(() => 160, []);

  if (!selectedUnit) {
    return (
      <AppScreen title="Closer Look" subtitle="Choose a shelf to browse">
        <View style={{ gap: spacing.md }}>
          {units.length === 0 ? (
            <AppCard>
              <AppText variant="body">No shelves found yet. Add a unit in Stands first.</AppText>
            </AppCard>
          ) : (
            units.map((unit) => (
              <TouchableOpacity key={unit.id} onPress={() => setSelectedUnit(unit)}>
                <AppCard>
                  <AppText variant="subtitle">{unit.name}</AppText>
                  <AppText variant="caption" style={{ color: colors.textMuted }}>
                    {unit.totalSlots} slots
                  </AppText>
                </AppCard>
              </TouchableOpacity>
            ))
          )}
          <AppButton title="Back to Library" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Closer Look" subtitle={selectedUnit.name}>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AppButton title="Back to Setup" variant="ghost" onPress={() => navigation.navigate('RowsHome' as any)} />
            <AppButton title="Change Shelf" variant="ghost" onPress={() => setSelectedUnit(null)} />
          </View>
          {shelfUnavailable ? (
            <AppText variant="caption" style={{ color: colors.textMuted }}>
              Shelf offline - visual mode only
            </AppText>
          ) : null}
        </View>
        <AppCard>
          <AppText variant="caption" style={{ color: colors.textMuted }}>
            Viewing shelf
          </AppText>
          <AppText variant="subtitle">{selectedUnit.name}</AppText>
        </AppCard>

        {records.length === 0 ? (
          <AppCard>
            <AppText variant="body">No records are assigned to this shelf yet.</AppText>
          </AppCard>
        ) : (
          <>
            <FlatList
              horizontal
              data={records}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: sidePadding, gap: ITEM_GAP }}
              snapToInterval={SNAP}
              decelerationRate="fast"
              onScroll={(e) => {
                const idx = Math.max(0, Math.min(records.length - 1, Math.round(e.nativeEvent.contentOffset.x / SNAP)));
                if (idx !== centeredIndex) setCenteredIndex(idx);
              }}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => {
                const active = index === centeredIndex;
                const imageUri = getCoverImageUri(item.coverImageRemoteUrl, item.coverImageLocalUri);
                return (
                  <View style={{ width: ITEM_WIDTH, alignItems: 'center' }}>
                    <View
                      style={[
                        styles.spine,
                        {
                          height: active ? 210 : 170,
                          borderRadius: radius.sm,
                          backgroundColor: active ? colors.surfaceAlt : index % 2 === 0 ? '#f3f3f3' : '#1c1c1c',
                          borderWidth: active ? 1 : 0,
                          borderColor: colors.accentMuted,
                          transform: [{ scale: active ? 1.04 : 0.92 }],
                        },
                      ]}
                    >
                      {active && imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.cover} resizeMode="cover" />
                      ) : (
                        <View style={styles.spineLabelWrap}>
                          <AppText
                            variant="caption"
                            style={{ color: active ? colors.textPrimary : index % 2 === 0 ? '#111' : '#fff' }}
                          >
                            Slot {item.firstSlot}
                          </AppText>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />
            {centeredRecord ? (
              <AppCard>
                <AppText variant="subtitle">{centeredRecord.title}</AppText>
                <AppText variant="body">{centeredRecord.artist}</AppText>
                <AppText variant="caption" style={{ color: colors.textMuted }}>
                  Slot {centeredRecord.firstSlot}
                </AppText>
              </AppCard>
            ) : null}
          </>
        )}
      </View>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  spine: {
    width: ITEM_WIDTH,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  spineLabelWrap: {
    transform: [{ rotate: '-90deg' }],
    width: 120,
    alignItems: 'center',
  },
});
