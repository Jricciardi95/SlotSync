import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
import { LibraryScreen } from '../screens/LibraryScreen';
import { AddRecordScreen } from '../screens/AddRecordScreen';
import { RecordDetailScreen } from '../screens/RecordDetailScreen';
import { ScanRecordScreen } from '../screens/ScanRecordScreen';
import { SongDetailScreen } from '../screens/SongDetailScreen';
import { CSVImportScreen } from '../screens/CSVImportScreen';
import { LibraryStackParamList } from './types';

const Stack = createNativeStackNavigator<LibraryStackParamList>();

export const LibraryNavigator: React.FC = () => {
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
        name="LibraryHome"
        component={LibraryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddRecord"
        component={AddRecordScreen}
        options={{ title: 'Add Record' }}
      />
      <Stack.Screen
        name="RecordDetail"
        component={RecordDetailScreen}
        options={{ title: 'Album Details' }}
      />
      <Stack.Screen
        name="ScanRecord"
        component={ScanRecordScreen}
        options={{ title: 'Scan Record' }}
      />
      <Stack.Screen
        name="SongDetail"
        component={SongDetailScreen}
        options={{ title: 'Song Details' }}
      />
      <Stack.Screen
        name="CSVImport"
        component={CSVImportScreen}
        options={{ title: 'Import from CSV' }}
      />
    </Stack.Navigator>
  );
};

