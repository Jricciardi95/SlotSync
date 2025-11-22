import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import { ModesScreen } from '../screens/ModesScreen';
import { LoadModeStartScreen } from '../screens/LoadModeStartScreen';
import { LoadModeFlowScreen } from '../screens/LoadModeFlowScreen';
import { CleanupModeHomeScreen } from '../screens/CleanupModeHomeScreen';
import { CleanupModeFlowScreen } from '../screens/CleanupModeFlowScreen';
import { ReorganizeModeStartScreen } from '../screens/ReorganizeModeStartScreen';
import { ReorganizeModeFlowScreen } from '../screens/ReorganizeModeFlowScreen';

import { ModesStackParamList } from './types';

const Stack = createNativeStackNavigator<ModesStackParamList>();

export const ModesNavigator: React.FC = () => {
  const { colors, typography } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontSize: 18,
        },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="ModesHome"
        component={ModesScreen}
        options={{ title: 'Modes' }}
      />
      <Stack.Screen
        name="LoadModeStart"
        component={LoadModeStartScreen}
        options={{ title: 'Load Mode' }}
      />
      <Stack.Screen
        name="LoadModeFlow"
        component={LoadModeFlowScreen}
        options={{ title: 'Loading Records' }}
      />
      <Stack.Screen
        name="CleanupModeHome"
        component={CleanupModeHomeScreen}
        options={{ title: 'Clean-Up Mode' }}
      />
      <Stack.Screen
        name="CleanupModeFlow"
        component={CleanupModeFlowScreen}
        options={{ title: 'Returning Records' }}
      />
      <Stack.Screen
        name="ReorganizeModeStart"
        component={ReorganizeModeStartScreen}
        options={{ title: 'Reorganize Mode' }}
      />
      <Stack.Screen
        name="ReorganizeModeFlow"
        component={ReorganizeModeFlowScreen}
        options={{ title: 'Reorganizing' }}
      />
    </Stack.Navigator>
  );
};

