import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import {
  createUnit,
  getUnitsByRow,
  persistUnitOrder,
} from '../data/repository';
import { Unit } from '../data/types';
import { StandsStackParamList } from '../navigation/types';
import { useFocusEffect } from '../navigation/useFocusEffect';

type Props = NativeStackScreenProps<StandsStackParamList, 'RowDetail'>;

export const RowDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const { rowId, rowName } = route.params;

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [addUnitVisible, setAddUnitVisible] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [totalSlots, setTotalSlots] = useState('34');

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getUnitsByRow(rowId);
      setUnits(rows);
    } finally {
      setLoading(false);
    }
  }, [rowId]);

  useFocusEffect(
    useCallback(() => {
      loadUnits();
    }, [loadUnits])
  );

  const handleAddUnit = async () => {
    if (!unitName.trim() || !ipAddress.trim()) {
      Alert.alert('Missing info', 'Name and IP address are required.');
      return;
    }

    try {
      await createUnit({
        name: unitName.trim(),
        rowId,
        ipAddress: ipAddress.trim(),
        totalSlots: Number(totalSlots) || 34,
      });
      setUnitName('');
      setIpAddress('');
      setTotalSlots('34');
      setAddUnitVisible(false);
      await loadUnits();
    } catch (error) {
      Alert.alert('Could not create unit', 'Please try again.');
      console.log(error);
    }
  };

  const onMoveUnit = async (unitId: string, direction: -1 | 1) => {
    setUnits((current) => {
      const index = current.findIndex((u) => u.id === unitId);
      if (index < 0) {
        return current;
      }
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= current.length) {
        return current;
      }
      const updated = [...current];
      const temp = updated[swapIndex];
      updated[swapIndex] = updated[index];
      updated[index] = temp;

      persistUnitOrder(
        rowId,
        updated.map((unit, order) => ({ ...unit, positionIndex: order }))
      ).catch((err) => console.log('Reorder failed', err));

      return updated.map((unit, order) => ({
        ...unit,
        positionIndex: order,
      }));
    });
  };

  const unitSubtitle = useMemo(() => {
    if (!units.length) return 'No units yet';
    return `${units.length} unit${units.length === 1 ? '' : 's'}`;
  }, [units]);

  return (
    <AppScreen title={rowName} subtitle={unitSubtitle}>
      <View style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
        <AppIconButton
          name="arrow-back"
          onPress={() => navigation.goBack()}
        />
      </View>
      <AppCard style={{ gap: spacing.md }}>
        <AppText variant="subtitle">Units in this stand</AppText>
        {loading ? (
          <AppText variant="body">Loading units…</AppText>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md }}
          >
            {units.length === 0 && (
              <View
                style={[
                  styles.unitPlaceholder,
                  { borderColor: colors.borderSubtle },
                ]}
              >
                <AppText variant="caption">
                  Create your first unit to begin arranging slots.
                </AppText>
              </View>
            )}
            {units.map((unit) => (
              <View
                key={unit.id}
                style={[
                  styles.unitCard,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.borderSubtle,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="albums"
                    size={16}
                    color={colors.accent}
                    style={{ marginRight: 8 }}
                  />
                  <AppText variant="subtitle">{unit.name}</AppText>
                </View>
                <AppText variant="caption" style={{ marginTop: 8 }}>
                  {unit.totalSlots} slots · IP {unit.ipAddress}
                </AppText>
                <View style={styles.unitActions}>
                  <AppIconButton
                    name="chevron-back"
                    onPress={() => onMoveUnit(unit.id, -1)}
                    style={{ opacity: unit.positionIndex === 0 ? 0.3 : 1 }}
                  />
                  <AppIconButton
                    name="chevron-forward"
                    onPress={() => onMoveUnit(unit.id, 1)}
                    style={{
                      opacity:
                        unit.positionIndex === units.length - 1 ? 0.3 : 1,
                    }}
                  />
                  <AppButton
                    title="Open"
                    variant="secondary"
                    onPress={() =>
                      navigation.navigate('UnitLayout', {
                        unitId: unit.id,
                        unitName: unit.name,
                      })
                    }
                    style={{ marginLeft: spacing.sm }}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <AppButton
          title="Add Unit to this Stand"
          variant="primary"
          onPress={() => setAddUnitVisible(true)}
        />
      </AppCard>

      <Modal visible={addUnitVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Add Unit
            </AppText>
            <TextInput
              placeholder="Unit name"
              placeholderTextColor={colors.textMuted}
              value={unitName}
              onChangeText={setUnitName}
              style={[
                styles.input,
                {
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
            />
            <TextInput
              placeholder="IP address"
              placeholderTextColor={colors.textMuted}
              value={ipAddress}
              onChangeText={setIpAddress}
              style={[
                styles.input,
                {
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
            />
            <TextInput
              placeholder="Total slots (default 34)"
              placeholderTextColor={colors.textMuted}
              value={totalSlots}
              keyboardType="numeric"
              onChangeText={setTotalSlots}
              style={[
                styles.input,
                {
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <AppButton
                title="Cancel"
                variant="ghost"
                onPress={() => setAddUnitVisible(false)}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Save"
                onPress={handleAddUnit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  unitPlaceholder: {
    width: 220,
    minHeight: 120,
    borderWidth: 1,
    justifyContent: 'center',
    padding: 16,
  },
  unitCard: {
    width: 260,
    padding: 16,
    borderWidth: 1,
  },
  unitActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});

