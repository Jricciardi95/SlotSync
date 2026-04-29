import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { ModesStackParamList } from '../navigation/types';
import { getRows } from '../data/repository';
import { Row } from '../data/types';
import { logger } from '../utils/logger';

type Props = NativeStackScreenProps<ModesStackParamList, 'LoadModeStart'>;

type OrganizationRule = 'title' | 'artist' | 'artistLastName' | 'year';

export const LoadModeStartScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [selectedRule, setSelectedRule] = useState<OrganizationRule | null>(null);

  useFocusEffect(
    useCallback(() => {
      getRows().then(setRows).catch((err) => {
        logger.error('Failed to load rows', err);
        Alert.alert('Error', 'Could not load stands.');
      });
    }, [])
  );

  const handleStart = () => {
    if (!selectedRow || !selectedRule) {
      Alert.alert('Missing selection', 'Please select a stand and organization rule.');
      return;
    }
    navigation.navigate('LoadModeFlow', {
      rowId: selectedRow.id,
      rowName: selectedRow.name,
      organizationRule: selectedRule,
    });
  };

  return (
    <AppScreen title="Load Mode" subtitle="Organize records into a stand with LED guidance.">
      <ScrollView>
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
            Select Stand
          </AppText>
          {rows.length === 0 ? (
            <AppText variant="caption">No stands available. Create one in the Stands tab.</AppText>
          ) : (
            <View style={styles.optionsGrid}>
              {rows.map((row) => (
                <AppButton
                  key={row.id}
                  title={row.name}
                  variant={selectedRow?.id === row.id ? 'primary' : 'secondary'}
                  onPress={() => setSelectedRow(row)}
                  style={styles.optionButton}
                />
              ))}
            </View>
          )}
        </AppCard>

        <AppCard style={{ marginTop: spacing.md }}>
          <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
            Organization Rule
          </AppText>
          <View style={styles.optionsGrid}>
            <AppButton
              title="By Title"
              variant={selectedRule === 'title' ? 'primary' : 'secondary'}
              onPress={() => setSelectedRule('title')}
              style={styles.optionButton}
            />
            <AppButton
              title="By Artist"
              variant={selectedRule === 'artist' ? 'primary' : 'secondary'}
              onPress={() => setSelectedRule('artist')}
              style={styles.optionButton}
            />
            <AppButton
              title="By Artist Last Name"
              variant={selectedRule === 'artistLastName' ? 'primary' : 'secondary'}
              onPress={() => setSelectedRule('artistLastName')}
              style={styles.optionButton}
            />
            <AppButton
              title="By Year"
              variant={selectedRule === 'year' ? 'primary' : 'secondary'}
              onPress={() => setSelectedRule('year')}
              style={styles.optionButton}
            />
          </View>
        </AppCard>

        <AppButton
          title="Start Loading"
          onPress={handleStart}
          disabled={!selectedRow || !selectedRule}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    minWidth: '45%',
  },
});

