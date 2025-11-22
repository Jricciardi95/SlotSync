import React, { useState, createContext, useContext } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { AppText } from '../components/AppText';
import { LibraryScreen } from '../screens/LibraryScreen';
import { StandsScreen } from '../screens/StandsScreen';
import { ModesScreen } from '../screens/ModesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddRecordScreen } from '../screens/AddRecordScreen';
import { RecordDetailScreen } from '../screens/RecordDetailScreen';
import { ScanRecordScreen } from '../screens/ScanRecordScreen';
import { SongDetailScreen } from '../screens/SongDetailScreen';
import { CSVImportScreen } from '../screens/CSVImportScreen';
import { BatchScanScreen } from '../screens/BatchScanScreen';
import { BatchReviewScreen } from '../screens/BatchReviewScreen';
import { RowDetailScreen } from '../screens/RowDetailScreen';
import { UnitLayoutScreen } from '../screens/UnitLayoutScreen';
import { LoadModeStartScreen } from '../screens/LoadModeStartScreen';
import { LoadModeFlowScreen } from '../screens/LoadModeFlowScreen';
import { CleanupModeHomeScreen } from '../screens/CleanupModeHomeScreen';
import { CleanupModeFlowScreen } from '../screens/CleanupModeFlowScreen';
import { ReorganizeModeStartScreen } from '../screens/ReorganizeModeStartScreen';
import { ReorganizeModeFlowScreen } from '../screens/ReorganizeModeFlowScreen';

type RootTab = 'Library' | 'Stands' | 'Modes' | 'Batch' | 'Settings';

type NavigationState = {
  currentTab: RootTab;
  libraryStack: string[];
  standsStack: string[];
  modesStack: string[];
  batchStack: string[];
};

type NavigationContextType = {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
  currentScreen: string;
  params: any;
};

export const NavigationContext = createContext<NavigationContextType | null>(null);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    // Return a mock navigation for screens that expect it
    return {
      navigate: () => {},
      goBack: () => {},
      currentScreen: '',
      params: {},
    };
  }
  return context;
};

export const CustomNavigation: React.FC = () => {
  const [state, setState] = useState<NavigationState>({
    currentTab: 'Library',
    libraryStack: ['LibraryHome'],
    standsStack: ['RowsHome'],
    modesStack: ['ModesHome'],
    batchStack: ['BatchScan'],
  });

  const [screenParams, setScreenParams] = useState<Record<string, any>>({});

  const navigate = (screen: string, params?: any) => {
    setState((prev) => {
      const newState = { ...prev };
      
      // Handle cross-tab navigation
      if (screen === 'LibraryHome' || screen.startsWith('Library') || screen === 'AddRecord' || screen === 'RecordDetail' || screen === 'ScanRecord' || screen === 'SongDetail' || screen === 'CSVImport') {
        newState.currentTab = 'Library';
        const stackKey = 'libraryStack';
        if (screen === 'LibraryHome') {
          newState[stackKey] = ['LibraryHome'];
        } else {
          newState[stackKey] = [...newState[stackKey], screen];
        }
      } else if (screen === 'RowsHome' || screen === 'RowDetail' || screen === 'UnitLayout') {
        newState.currentTab = 'Stands';
        const stackKey = 'standsStack';
        if (screen === 'RowsHome') {
          newState[stackKey] = ['RowsHome'];
        } else {
          newState[stackKey] = [...newState[stackKey], screen];
        }
      } else if (screen === 'ModesHome' || screen.startsWith('LoadMode') || screen.startsWith('CleanupMode') || screen.startsWith('ReorganizeMode')) {
        newState.currentTab = 'Modes';
        const stackKey = 'modesStack';
        if (screen === 'ModesHome') {
          newState[stackKey] = ['ModesHome'];
        } else {
          newState[stackKey] = [...newState[stackKey], screen];
        }
      } else if (screen === 'BatchScan' || screen === 'BatchReview') {
        newState.currentTab = 'Batch';
        const stackKey = 'batchStack';
        if (screen === 'BatchScan') {
          newState[stackKey] = ['BatchScan'];
        } else {
          newState[stackKey] = [...newState[stackKey], screen];
        }
      } else {
        // Default to current tab's stack
        const stackKey = getStackKey(prev.currentTab);
        newState[stackKey] = [...newState[stackKey], screen];
      }
      
      return newState;
    });
    if (params) {
      setScreenParams((prev) => ({ ...prev, [screen]: params }));
    }
  };

  const goBack = () => {
    setState((prev) => {
      const newState = { ...prev };
      const stackKey = getStackKey(prev.currentTab);
      if (newState[stackKey].length > 1) {
        const previousScreen = newState[stackKey][newState[stackKey].length - 2];
        newState[stackKey] = newState[stackKey].slice(0, -1);
        // Clean up params for removed screen
        setScreenParams((prevParams) => {
          const newParams = { ...prevParams };
          delete newParams[newState[stackKey][newState[stackKey].length - 1]];
          return newParams;
        });
        return newState;
      }
      return prev;
    });
  };

  const getStackKey = (tab: RootTab): 'libraryStack' | 'standsStack' | 'modesStack' | 'batchStack' => {
    switch (tab) {
      case 'Library':
        return 'libraryStack';
      case 'Stands':
        return 'standsStack';
      case 'Modes':
        return 'modesStack';
      case 'Batch':
        return 'batchStack';
      default:
        return 'libraryStack';
    }
  };

  const getCurrentScreen = () => {
    if (state.currentTab === 'Settings') {
      return 'Settings';
    }
    const stackKey = getStackKey(state.currentTab);
    const stack = state[stackKey];
    return stack[stack.length - 1] || 'LibraryHome';
  };

  const currentScreen = getCurrentScreen();
  const params = screenParams[currentScreen] || {};

  const renderScreen = () => {
    const mockNavigation = {
      navigate,
      goBack,
      currentScreen,
      params,
      // Add methods that screens might use
      setOptions: () => {},
      addListener: () => () => {},
    };

    switch (currentScreen) {
      // Library screens
      case 'LibraryHome':
        return <LibraryScreen navigation={mockNavigation as any} route={{ params: {}, name: 'LibraryHome' } as any} />;
      case 'AddRecord':
        return <AddRecordScreen navigation={mockNavigation as any} route={{ params, name: 'AddRecord' } as any} />;
      case 'RecordDetail':
        return <RecordDetailScreen navigation={mockNavigation as any} route={{ params, name: 'RecordDetail' } as any} />;
      case 'ScanRecord':
        return <ScanRecordScreen navigation={mockNavigation as any} route={{ params: {}, name: 'ScanRecord' } as any} />;
      case 'SongDetail':
        return <SongDetailScreen navigation={mockNavigation as any} route={{ params, name: 'SongDetail' } as any} />;
      case 'CSVImport':
        return <CSVImportScreen navigation={mockNavigation as any} route={{ params: {}, name: 'CSVImport' } as any} />;
      case 'BatchScan':
        return <BatchScanScreen navigation={mockNavigation as any} route={{ params: {}, name: 'BatchScan' } as any} />;
      case 'BatchReview':
        return <BatchReviewScreen navigation={mockNavigation as any} route={{ params, name: 'BatchReview' } as any} />;
      
      // Stands screens
      case 'RowsHome':
        return <StandsScreen navigation={mockNavigation as any} route={{ params: {}, name: 'RowsHome' } as any} />;
      case 'RowDetail':
        return <RowDetailScreen navigation={mockNavigation as any} route={{ params, name: 'RowDetail' } as any} />;
      case 'UnitLayout':
        return <UnitLayoutScreen navigation={mockNavigation as any} route={{ params, name: 'UnitLayout' } as any} />;
      
      // Modes screens
      case 'ModesHome':
        return <ModesScreen navigation={mockNavigation as any} route={{ params: {}, name: 'ModesHome' } as any} />;
      case 'LoadModeStart':
        return <LoadModeStartScreen navigation={mockNavigation as any} route={{ params: {}, name: 'LoadModeStart' } as any} />;
      case 'LoadModeFlow':
        return <LoadModeFlowScreen navigation={mockNavigation as any} route={{ params, name: 'LoadModeFlow' } as any} />;
      case 'CleanupModeHome':
        return <CleanupModeHomeScreen navigation={mockNavigation as any} route={{ params: {}, name: 'CleanupModeHome' } as any} />;
      case 'CleanupModeFlow':
        return <CleanupModeFlowScreen navigation={mockNavigation as any} route={{ params, name: 'CleanupModeFlow' } as any} />;
      case 'ReorganizeModeStart':
        return <ReorganizeModeStartScreen navigation={mockNavigation as any} route={{ params: {}, name: 'ReorganizeModeStart' } as any} />;
      case 'ReorganizeModeFlow':
        return <ReorganizeModeFlowScreen navigation={mockNavigation as any} route={{ params, name: 'ReorganizeModeFlow' } as any} />;
      
      // Settings
      case 'Settings':
        return <SettingsScreen />;
      
      default:
        return <LibraryScreen navigation={mockNavigation as any} route={{ params: {}, name: 'LibraryHome' } as any} />;
    }
  };

  const { colors, spacing } = useTheme();

  const tabs: { name: RootTab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { name: 'Library', icon: 'albums', label: 'Library' },
    { name: 'Stands', icon: 'grid', label: 'Stands' },
    { name: 'Modes', icon: 'options', label: 'Modes' },
    { name: 'Batch', icon: 'camera', label: 'Batch' },
    { name: 'Settings', icon: 'settings', label: 'Settings' },
  ];

  const handleTabPress = (tab: RootTab) => {
    setState((prev) => {
      if (tab === 'Settings') {
        return { ...prev, currentTab: tab };
      }
      // Reset to home screen when switching tabs
      const stackKey = getStackKey(tab);
      return {
        ...prev,
        currentTab: tab,
        [stackKey]: [getHomeScreenForTab(tab)],
      };
    });
    // Clear params when switching tabs
    setScreenParams({});
  };

  const getHomeScreenForTab = (tab: RootTab): string => {
    switch (tab) {
      case 'Library':
        return 'LibraryHome';
      case 'Stands':
        return 'RowsHome';
      case 'Modes':
        return 'ModesHome';
      case 'Batch':
        return 'BatchScan';
      default:
        return 'LibraryHome';
    }
  };

  return (
    <NavigationContext.Provider value={{ navigate, goBack, currentScreen, params }}>
      <View style={styles.container}>
        <View style={styles.content}>{renderScreen()}</View>
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: colors.backgroundMuted,
              borderTopColor: colors.borderSubtle,
            },
          ]}
        >
          {tabs.map((tab) => {
            const isActive = state.currentTab === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => handleTabPress(tab.name)}
                style={styles.tab}
              >
                <Ionicons
                  name={tab.icon}
                  size={24}
                  color={isActive ? colors.accent : colors.textMuted}
                />
                <AppText
                  variant="caption"
                  style={{
                    color: isActive ? colors.accent : colors.textMuted,
                    marginTop: 2,
                    fontSize: 11,
                  }}
                >
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </NavigationContext.Provider>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingBottom: 85, // Space for sticky tab bar
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    height: 85,
    borderTopWidth: 1,
    paddingBottom: 20,
    paddingTop: 4,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

