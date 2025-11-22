import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import { StandsScreen } from '../screens/StandsScreen';
import { RowDetailScreen } from '../screens/RowDetailScreen';
import { UnitLayoutScreen } from '../screens/UnitLayoutScreen';
import { StandsStackParamList } from './types';

const Stack = createNativeStackNavigator<StandsStackParamList>();

export const StandsNavigator: React.FC = () => {
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
        name="RowsHome"
        component={StandsScreen}
        options={{ title: 'Stands' }}
      />
      <Stack.Screen
        name="RowDetail"
        component={RowDetailScreen}
        options={({ route }) => ({
          title: route.params.rowName,
        })}
      />
      <Stack.Screen
        name="UnitLayout"
        component={UnitLayoutScreen}
        options={{ title: 'Unit Layout' }}
      />
    </Stack.Navigator>
  );
};

