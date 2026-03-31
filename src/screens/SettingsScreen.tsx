import React, { useState } from 'react';
import { useNavigation } from '../navigation/hooks';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { ShelfConnectionPanel } from '../components/ShelfConnectionPanel';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { spacing } = useTheme();
  const [subView, setSubView] = useState<'menu' | 'shelf'>('menu');

  const handleCSVImport = () => {
    navigation.navigate('CSVImport');
  };

  if (subView === 'shelf') {
    return <ShelfConnectionPanel onBack={() => setSubView('menu')} />;
  }

  return (
    <AppScreen
      title="Settings"
      subtitle="Hardware connections, imports, and advanced preferences."
    >
      <AppCard>
        <AppText variant="subtitle" style={{ marginBottom: 12 }}>
          Smart shelf (ESP32)
        </AppText>
        <AppText variant="body" style={{ marginBottom: 16 }}>
          Connect to your SlotSync shelf on Wi‑Fi: set the ESP32 address, test the link, and use
          developer controls while building.
        </AppText>
        <AppButton title="Shelf connection" onPress={() => setSubView('shelf')} />
      </AppCard>

      <AppCard>
        <AppText variant="subtitle" style={{ marginBottom: 12 }}>
          Import Collection
        </AppText>
        <AppText variant="body" style={{ marginBottom: 16 }}>
          Import your existing collection from a CSV file (e.g., exported from Discogs).
        </AppText>
        <AppButton title="Import from CSV" onPress={handleCSVImport} />
      </AppCard>

      <AppCard style={{ marginTop: spacing.md }}>
        <AppText variant="subtitle" style={{ marginBottom: 12 }}>
          Configure SlotSync
        </AppText>
        <AppText variant="body" style={{ marginBottom: 16 }}>
          Additional preferences will appear here.
        </AppText>
      </AppCard>
    </AppScreen>
  );
};
