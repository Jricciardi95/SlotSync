import React from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { ModesStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';

type Props = NativeStackScreenProps<ModesStackParamList, 'ModesHome'>;

export const ModesScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing } = useTheme();

  return (
    <AppScreen
      title="Modes"
      subtitle="Load, Clean-Up, and Reorganize helpers with LED guidance."
    >
      <AppCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <Ionicons name="cube-outline" size={24} color={colors.accent} style={{ marginRight: spacing.sm }} />
          <AppText variant="subtitle">Load Mode</AppText>
        </View>
        <AppText variant="body" style={{ marginBottom: spacing.md }}>
          Guided loading of your collection with LED highlights showing where each record should go.
        </AppText>
        <AppButton
          title="Start Load Mode"
          onPress={() => navigation.navigate('LoadModeStart')}
        />
      </AppCard>

      <AppCard style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <Ionicons name="refresh-outline" size={24} color={colors.accent} style={{ marginRight: spacing.sm }} />
          <AppText variant="subtitle">Clean-Up Mode</AppText>
        </View>
        <AppText variant="body" style={{ marginBottom: spacing.md }}>
          Return records from listening sessions back to their slots with LED guidance.
        </AppText>
        <AppButton
          title="Start Clean-Up Mode"
          variant="secondary"
          onPress={() => navigation.navigate('CleanupModeHome')}
        />
      </AppCard>

      <AppCard style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <Ionicons name="swap-horizontal-outline" size={24} color={colors.accent} style={{ marginRight: spacing.sm }} />
          <AppText variant="subtitle">Reorganize Mode</AppText>
        </View>
        <AppText variant="body" style={{ marginBottom: spacing.md }}>
          Reorder your collection with minimal swaps, guided by LED highlights.
        </AppText>
        <AppButton
          title="Start Reorganize Mode"
          variant="secondary"
          onPress={() => navigation.navigate('ReorganizeModeStart')}
        />
      </AppCard>
    </AppScreen>
  );
};
