import { logger } from '../utils/logger';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { ModesStackParamList } from '../navigation/types';
import {
  getRecords,
  getSlotGroupsByRow,
  setRecordLocation,
  assignRecordToSlotGroup,
  getUnitById,
} from '../data/repository';
import { RecordModel, ShelfSlotGroup } from '../data/types';
import { setSlotLight, clearSlotLight } from '../services/ShelfLightingClient';

type Props = NativeStackScreenProps<ModesStackParamList, 'LoadModeFlow'>;

type LoadMapping = {
  record: RecordModel;
  slotGroup: ShelfSlotGroup & { unitName: string; unitIpAddress: string };
};

export const LoadModeFlowScreen: React.FC<Props> = ({ route, navigation }) => {
  const { rowId, rowName, organizationRule } = route.params;
  const { colors, spacing } = useTheme();
  const [mappings, setMappings] = useState<LoadMapping[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lighting, setLighting] = useState(false);

  const currentMapping = useMemo(() => mappings[currentIndex], [mappings, currentIndex]);

  useEffect(() => {
    const buildMappings = async () => {
      setLoading(true);
      try {
        const [allRecords, slotGroups] = await Promise.all([
          getRecords(),
          getSlotGroupsByRow(rowId),
        ]);

        // Filter to only records that don't have a location yet (for v1, simple rule)
        const unplacedRecords = allRecords.filter((r) => {
          // We'll check if they have a location in the slot groups
          return !slotGroups.some((sg) => sg.recordId === r.id);
        });

        // Sort records by organization rule
        const sortedRecords = [...unplacedRecords].sort((a, b) => {
          switch (organizationRule) {
            case 'title':
              return (a.title || '').localeCompare(b.title || '');
            case 'artist':
              return (a.artist || '').localeCompare(b.artist || '');
            case 'artistLastName':
              const aLast = a.artistLastName || a.artist.split(' ').pop() || '';
              const bLast = b.artistLastName || b.artist.split(' ').pop() || '';
              return aLast.localeCompare(bLast);
            case 'year':
              return (a.year || 0) - (b.year || 0);
            default:
              return 0;
          }
        });

        // Filter to only empty slot groups
        const emptyGroups = slotGroups.filter((sg) => !sg.recordId);

        // Map records to slot groups
        const newMappings: LoadMapping[] = [];
        for (let i = 0; i < Math.min(sortedRecords.length, emptyGroups.length); i += 1) {
          newMappings.push({
            record: sortedRecords[i],
            slotGroup: emptyGroups[i],
          });
        }

        setMappings(newMappings);
      } catch (error) {
        logger.error('Failed to build load mappings', error);
        Alert.alert('Error', 'Could not prepare load mappings.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    buildMappings();
  }, [rowId, organizationRule, navigation]);

  useEffect(() => {
    if (!currentMapping) return;

    const lightSlots = async () => {
      setLighting(true);
      try {
        const slots = currentMapping.slotGroup.physicalSlots;
        await setSlotLight({
          ipAddress: currentMapping.slotGroup.unitIpAddress,
          slot: slots[0],
          allSlots: slots,
          color: '#08F7FE',
          brightness: 0.9,
          effect: 'steady',
        });
      } catch {
        // Error handled in client
      } finally {
        setLighting(false);
      }
    };

    lightSlots();

    return () => {
      // Clear lights when component unmounts or mapping changes
      if (currentMapping) {
        clearSlotLight({
          ipAddress: currentMapping.slotGroup.unitIpAddress,
          slot: 1,
        }).catch(() => {});
      }
    };
  }, [currentMapping]);

  const handleNext = async () => {
    if (!currentMapping) return;

    try {
      await clearSlotLight({
        ipAddress: currentMapping.slotGroup.unitIpAddress,
        slot: 1,
      });

      // Save location
      await assignRecordToSlotGroup({
        recordId: currentMapping.record.id,
        slotGroupId: currentMapping.slotGroup.id,
      });

      // Move to next
      if (currentIndex < mappings.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        Alert.alert('Complete', 'All records have been loaded!', [
          { text: 'OK', onPress: () => navigation.navigate('ModesHome') },
        ]);
      }
    } catch (error) {
      logger.error('Failed to save location', error);
      Alert.alert('Error', 'Could not save record location.');
    }
  };

  const handleCancel = async () => {
    if (currentMapping) {
      await clearSlotLight({
        ipAddress: currentMapping.slotGroup.unitIpAddress,
        slot: 1,
      });
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <AppScreen title="Preparing...">
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
          <AppText variant="body" style={{ marginTop: spacing.md }}>
            Building load plan...
          </AppText>
        </View>
      </AppScreen>
    );
  }

  if (mappings.length === 0) {
    return (
      <AppScreen title="No Records">
        <AppCard>
          <AppText variant="body">
            All records in this stand are already placed, or there are no records to load.
          </AppText>
          <AppButton
            title="Go Back"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.md }}
          />
        </AppCard>
      </AppScreen>
    );
  }

  const slotLabel =
    currentMapping.slotGroup.physicalSlots.length === 1
      ? `Slot ${currentMapping.slotGroup.physicalSlots[0]}`
      : `Slots ${currentMapping.slotGroup.physicalSlots[0]}–${
          currentMapping.slotGroup.physicalSlots[
            currentMapping.slotGroup.physicalSlots.length - 1
          ]
        }`;

  return (
    <AppScreen title={`Loading: ${currentIndex + 1} of ${mappings.length}`}>
      <AppCard>
        <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
          Current Record
        </AppText>
        <AppText variant="body" style={{ marginBottom: spacing.xs }}>
          {currentMapping.record.artist}
        </AppText>
        <AppText variant="body" style={{ marginBottom: spacing.md }}>
          {currentMapping.record.title}
        </AppText>

        <View
          style={[
            styles.divider,
            { backgroundColor: colors.borderSubtle, marginVertical: spacing.md },
          ]}
        />

        <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
          Target Location
        </AppText>
        <AppText variant="body" style={{ marginBottom: spacing.xs }}>
          {currentMapping.slotGroup.unitName}
        </AppText>
        <AppText variant="body" style={{ marginBottom: spacing.lg }}>
          {slotLabel}
        </AppText>

        {lighting && (
          <View style={styles.lightingIndicator}>
            <ActivityIndicator size="small" color={colors.accent} />
            <AppText variant="caption" style={{ marginLeft: spacing.sm }}>
              Lighting slots...
            </AppText>
          </View>
        )}
      </AppCard>

      <View style={styles.actions}>
        <AppButton
          title="Cancel"
          variant="ghost"
          onPress={handleCancel}
          style={{ flex: 1 }}
        />
        <AppButton
          title="Next"
          onPress={handleNext}
          disabled={lighting}
          style={{ flex: 1, marginLeft: spacing.sm }}
        />
      </View>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  lightingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
  },
});

