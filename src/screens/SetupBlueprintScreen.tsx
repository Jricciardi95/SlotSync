import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import { StandsStackParamList } from '../navigation/types';
import { createUnit, getAllUnits, getUnitAssignedRecords } from '../data/repository';
import { Unit } from '../data/types';
import {
  createShapeDraft,
  loadSetupBlueprint,
  saveSetupBlueprint,
  SetupPositionPreset,
  SetupShape,
  SetupShapeType,
} from '../services/setupBlueprintStorage';
import { logger } from '../utils/logger';

type Props = NativeStackScreenProps<StandsStackParamList, 'RowsHome'>;

export const SetupBlueprintScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [shapes, setShapes] = useState<SetupShape[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [shapeType, setShapeType] = useState<SetupShapeType>('shelf');
  const [shapeName, setShapeName] = useState('');
  const [preset, setPreset] = useState<SetupPositionPreset>('middle');
  const [linkedUnitId, setLinkedUnitId] = useState<string>('');
  const [createUnitForShelf, setCreateUnitForShelf] = useState(true);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSlots, setNewUnitSlots] = useState('30');
  const [newUnitIp, setNewUnitIp] = useState('');
  const [unitRecordCounts, setUnitRecordCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const [saved, availableUnits] = await Promise.all([loadSetupBlueprint(), getAllUnits()]);
    setShapes(saved);
    setUnits(availableUnits);
    const counts = await Promise.all(
      availableUnits.map(async (u) => {
        const assigned = await getUnitAssignedRecords(u.id);
        return [u.id, assigned.length] as const;
      })
    );
    setUnitRecordCounts(Object.fromEntries(counts));
  }, []);

  useEffect(() => {
    refresh().catch((e) => logger.error('[SetupBlueprint] refresh failed', e));
  }, [refresh]);

  const persistShapes = useCallback(async (next: SetupShape[]) => {
    setShapes(next);
    await saveSetupBlueprint(next);
  }, []);

  const addShape = useCallback(async () => {
    const name = shapeName.trim() || (shapeType === 'shelf' ? 'Shelf' : shapeType === 'turntable' ? 'Turntable' : shapeType === 'speaker' ? 'Speaker' : 'Label');
    let unitId: string | undefined = undefined;

    if (shapeType === 'shelf') {
      if (createUnitForShelf) {
        const slots = Math.max(1, Number(newUnitSlots) || 30);
        const created = await createUnit({
          name: newUnitName.trim() || name,
          ipAddress: newUnitIp.trim() || '',
          totalSlots: slots,
          rowId: null,
        });
        unitId = created.id;
        setUnits((prev) => [created, ...prev]);
      } else if (linkedUnitId) {
        unitId = linkedUnitId;
      }
    }

    const draft = createShapeDraft(shapeType, name, preset, unitId, {
      espBaseUrl: newUnitIp.trim() || undefined,
      slotCount: Number(newUnitSlots) || undefined,
    });
    await persistShapes([...shapes, draft]);
    setModalVisible(false);
    setShapeName('');
    setLinkedUnitId('');
    setNewUnitName('');
    setNewUnitSlots('30');
    setNewUnitIp('');
  }, [
    shapeName,
    shapeType,
    createUnitForShelf,
    newUnitSlots,
    newUnitName,
    newUnitIp,
    linkedUnitId,
    preset,
    persistShapes,
    shapes,
  ]);

  const removeShape = useCallback(
    async (id: string) => {
      await persistShapes(shapes.filter((s) => s.id !== id));
    },
    [persistShapes, shapes]
  );

  const shapeBg = useMemo(
    () => ({
      shelf: '#223849',
      turntable: '#333a4a',
      speaker: '#2d2d2d',
      label: '#1f2630',
    }),
    []
  );

  return (
    <>
      <AppScreen title="Shelves Setup" subtitle="Blueprint your listening area and tap a shelf to browse it.">
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppButton title="Add shelf" onPress={() => setModalVisible(true)} />
            <AppButton title="Manage Stands" variant="ghost" onPress={() => navigation.navigate('RowsManage')} />
          </View>

          <AppCard>
            <AppText variant="subtitle">Start here</AppText>
            <AppText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.xs }}>
              1) Add a shelf shape. 2) Link/create its shelf unit. 3) Tap the shelf shape to open Closer Look.
            </AppText>
            <AppText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.xs }}>
              Use the list below the canvas to rename or delete shapes.
            </AppText>
          </AppCard>

          <AppCard>
            <View style={[styles.canvas, { borderColor: colors.borderSubtle, backgroundColor: '#0d1520' }]}>
              <View style={styles.gridOverlay} />
              {shapes.length === 0 ? (
                <View style={styles.emptyCanvas}>
                  <AppText variant="subtitle" style={{ color: '#dbe8f6' }}>
                    No setup shapes yet
                  </AppText>
                  <AppText variant="caption" style={{ color: '#aac4de', marginTop: 6, textAlign: 'center' }}>
                    Tap Add Shape, create a shelf, then tap it to jump into Closer Look.
                  </AppText>
                </View>
              ) : null}
              {shapes.map((shape) => (
                <TouchableOpacity
                  key={shape.id}
                  style={[
                    styles.shape,
                    {
                      left: shape.x,
                      top: shape.y,
                      width: shape.width,
                      height: shape.height,
                      borderRadius: shape.type === 'turntable' ? shape.width / 2 : 8,
                      backgroundColor: shapeBg[shape.type],
                      borderColor: shape.type === 'shelf' ? colors.accentMuted : colors.borderSubtle,
                    },
                  ]}
                  onPress={() => {
                    if (shape.type === 'shelf' && shape.linkedUnitId) {
                      navigation.navigate('CloserLook' as any, { unitId: shape.linkedUnitId });
                      return;
                    }
                  }}
                  onLongPress={() => removeShape(shape.id)}
                >
                  {shape.type === 'shelf' ? (
                    <>
                      <AppText variant="caption" style={{ color: '#dbe8f6', textAlign: 'center', fontWeight: '600' }}>
                        {shape.name}
                      </AppText>
                      {shape.linkedUnitId ? (
                        <>
                          <AppText variant="caption" style={{ color: '#aac4de', fontSize: 10 }}>
                            {unitRecordCounts[shape.linkedUnitId] ?? 0} records
                          </AppText>
                          <AppText variant="caption" style={{ color: '#aac4de', fontSize: 10 }}>
                            {units.find((u) => u.id === shape.linkedUnitId)?.totalSlots ?? '-'} slots
                          </AppText>
                          <AppText
                            variant="caption"
                            style={{
                              color: units.find((u) => u.id === shape.linkedUnitId)?.ipAddress ? '#78e08f' : '#f6b93b',
                              fontSize: 10,
                            }}
                          >
                            {units.find((u) => u.id === shape.linkedUnitId)?.ipAddress ? 'IP configured' : 'No shelf IP'}
                          </AppText>
                        </>
                      ) : (
                        <AppText variant="caption" style={{ color: '#f6b93b', fontSize: 10 }}>
                          Not linked
                        </AppText>
                      )}
                    </>
                  ) : (
                    <AppText variant="caption" style={{ color: '#dbe8f6', textAlign: 'center' }}>
                      {shape.name}
                    </AppText>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <AppText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.sm }}>
              Tap shelf shapes to open Closer Look.
            </AppText>
          </AppCard>

          {shapes.length > 0 ? (
            <AppCard>
              <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
                Shapes
              </AppText>
              <View style={{ gap: spacing.sm }}>
                {shapes.map((shape) => (
                  <View
                    key={`manage-${shape.id}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 6,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="body">{shape.name}</AppText>
                      <AppText variant="caption" style={{ color: colors.textMuted }}>
                        {shape.type}
                      </AppText>
                    </View>
                    <AppButton title="Delete" variant="ghost" onPress={() => removeShape(shape.id)} />
                  </View>
                ))}
              </View>
            </AppCard>
          ) : null}
        </View>
      </AppScreen>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.backgroundMuted, borderColor: colors.borderSubtle, borderRadius: radius.lg }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="subtitle">Add Blueprint Shape</AppText>
              <AppIconButton name="close" onPress={() => setModalVisible(false)} />
            </View>

            <TextInput
              value={shapeName}
              onChangeText={setShapeName}
              placeholder="Name (e.g. Top Left Shelf)"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
            />

            <View style={styles.rowWrap}>
              {(['shelf', 'turntable', 'speaker', 'label'] as SetupShapeType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setShapeType(t)}
                  style={[styles.chip, { borderColor: colors.borderSubtle, backgroundColor: shapeType === t ? colors.accentMuted : colors.surfaceAlt }]}
                >
                  <AppText variant="caption">{t}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.rowWrap}>
              {(['top_left', 'top_right', 'middle', 'bottom_left', 'bottom_right'] as SetupPositionPreset[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPreset(p)}
                  style={[styles.chip, { borderColor: colors.borderSubtle, backgroundColor: preset === p ? colors.accentMuted : colors.surfaceAlt }]}
                >
                  <AppText variant="caption">{p.replace('_', ' ')}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            {shapeType === 'shelf' ? (
              <View style={{ gap: spacing.sm }}>
                <View style={styles.rowWrap}>
                  <TouchableOpacity
                    onPress={() => setCreateUnitForShelf(true)}
                    style={[styles.chip, { borderColor: colors.borderSubtle, backgroundColor: createUnitForShelf ? colors.accentMuted : colors.surfaceAlt }]}
                  >
                    <AppText variant="caption">Create Unit</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCreateUnitForShelf(false)}
                    style={[styles.chip, { borderColor: colors.borderSubtle, backgroundColor: !createUnitForShelf ? colors.accentMuted : colors.surfaceAlt }]}
                  >
                    <AppText variant="caption">Link Existing Unit</AppText>
                  </TouchableOpacity>
                </View>

                {createUnitForShelf ? (
                  <>
                    <TextInput
                      value={newUnitName}
                      onChangeText={setNewUnitName}
                      placeholder="Shelf unit name"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                    />
                    <TextInput
                      value={newUnitSlots}
                      onChangeText={setNewUnitSlots}
                      placeholder="Slot count (e.g. 30)"
                      keyboardType="number-pad"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                    />
                    <TextInput
                      value={newUnitIp}
                      onChangeText={setNewUnitIp}
                      placeholder="Optional ESP32 base URL/IP"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                    />
                  </>
                ) : (
                  <View style={styles.rowWrap}>
                    {units.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => setLinkedUnitId(u.id)}
                        style={[styles.chip, { borderColor: colors.borderSubtle, backgroundColor: linkedUnitId === u.id ? colors.accentMuted : colors.surfaceAlt }]}
                      >
                        <AppText variant="caption">{u.name}</AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            <AppButton title="Add to Blueprint" onPress={addShape} />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  canvas: {
    height: 420,
    borderWidth: 1,
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  emptyCanvas: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  shape: {
    position: 'absolute',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
