import React from 'react';
import { useNavigation } from '../navigation/hooks';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { spacing } = useTheme();

  const handleCSVImport = () => {
    // Navigate directly to CSVImport (will switch to Library tab automatically)
    navigation.navigate('CSVImport');
  };

  return (
    <AppScreen
      title="Settings"
      subtitle="Hardware connections, imports, and advanced preferences."
    >
      <AppCard>
        <AppText variant="subtitle" style={{ marginBottom: 12 }}>
          Import Collection
        </AppText>
        <AppText variant="body" style={{ marginBottom: 16 }}>
          Import your existing collection from a CSV file (e.g., exported from Discogs).
        </AppText>
        <AppButton
          title="Import from CSV"
          onPress={handleCSVImport}
        />
      </AppCard>

      <AppCard style={{ marginTop: spacing.md }}>
        <AppText variant="subtitle" style={{ marginBottom: 12 }}>
          Configure SlotSync
        </AppText>
        <AppText variant="body" style={{ marginBottom: 16 }}>
          Additional settings like hardware pairing and diagnostics will be available here.
        </AppText>
      </AppCard>
    </AppScreen>
  );
};
