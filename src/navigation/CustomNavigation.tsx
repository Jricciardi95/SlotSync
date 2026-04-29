import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { AppText } from '../components/AppText';
import { navigationHelpers } from './navigationHelpers';
import { logger } from '../utils/logger';
import { ShelfOfflineBanner } from '../components/ShelfOfflineBanner';
import { NavigationContext } from './NavigationContext';

// Screen imports - direct imports (no circular dependencies since screens import from navigation, not vice versa)
import { LibraryScreen } from '../screens/LibraryScreen';
import { StandsScreen } from '../screens/StandsScreen';
import { ModesScreen } from '../screens/ModesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddRecordScreen } from '../screens/AddRecordScreen';
import { RecordDetailScreen } from '../screens/RecordDetailScreen';
import { EditRecordScreen } from '../screens/EditRecordScreen';
import { ScanRecordScreen } from '../screens/ScanRecordScreen';
import { SongDetailScreen } from '../screens/SongDetailScreen';
import { CSVImportScreen } from '../screens/CSVImportScreen';
import { BatchScanScreen } from '../screens/BatchScanScreen';
import { BatchReviewScreen } from '../screens/BatchReviewScreen';
import { DevTestScreen } from '../screens/DevTestScreen';
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

export const CustomNavigation: React.FC = () => {
  const [state, setState] = useState<NavigationState>({
    currentTab: 'Library',
    libraryStack: ['LibraryHome'],
    standsStack: ['RowsHome'],
    modesStack: ['ModesHome'],
    batchStack: ['BatchScan'],
  });

  const [screenParams, setScreenParams] = useState<Record<string, any>>({});
  // Use a ref to store params immediately (before React state update)
  const paramsRef = React.useRef<Record<string, any>>({});

  const navigate = (screen: string, params?: any) => {
    logger.verbose('[CustomNavigation] navigate', screen, params);
    
    // CRITICAL: Update ref immediately (synchronous) so params are available right away
    if (params) {
      paramsRef.current = { ...paramsRef.current, [screen]: params };
      logger.verbose('[CustomNavigation] params ref', screen);
    } else {
      const updated = { ...paramsRef.current };
      delete updated[screen];
      paramsRef.current = updated;
    }
    
    // Then update React state (async, but ref is already set)
    if (params) {
      setScreenParams((prev) => {
        const updated = { ...prev, [screen]: params };
        logger.verbose('[CustomNavigation] params state', screen);
        return updated;
      });
    } else {
      setScreenParams((prev) => {
        const updated = { ...prev };
        delete updated[screen];
        return updated;
      });
    }
    
    // Then update navigation state
    setState((prev) => {
      const newState = { ...prev };
      
      // Handle cross-tab navigation using helper
      const targetTab = navigationHelpers.getTabForScreen(screen);
      newState.currentTab = targetTab;
      const stackKey = navigationHelpers.getStackKey(targetTab);
      const homeScreen = navigationHelpers.getHomeScreenForTab(targetTab);
      
      if (screen === homeScreen) {
        newState[stackKey] = [homeScreen];
      } else {
        newState[stackKey] = [...newState[stackKey], screen];
      }
      
      logger.verbose('[CustomNavigation] stack', newState[stackKey]);
      return newState;
    });
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

  const canGoBack = () => {
    // Check if we can go back by seeing if the current stack has more than 1 screen
    const stackKey = getStackKey(state.currentTab);
    return state[stackKey].length > 1;
  };

  const getStackKey = (tab: RootTab) => navigationHelpers.getStackKey(tab);

  const getCurrentScreen = () => {
    if (state.currentTab === 'Settings') {
      return 'Settings';
    }
    const stackKey = getStackKey(state.currentTab);
    const stack = state[stackKey];
    return stack[stack.length - 1] || 'LibraryHome';
  };

  const currentScreen = getCurrentScreen();
  // CRITICAL: Use ref first (immediate), then fall back to state (for React updates)
  // This ensures params are available even if state hasn't updated yet
  const params = paramsRef.current[currentScreen] || screenParams[currentScreen] || {};
  
  // Debug logging to track params
  useEffect(() => {
    logger.verbose('[CustomNavigation] screen', currentScreen);
  }, [currentScreen, params, screenParams]);

  const renderScreen = () => {
    const mockNavigation = {
      navigate,
      goBack,
      canGoBack,
      currentScreen,
      params, // Include params in navigation object for fallback access
      // Add methods that screens might use
      setOptions: () => {},
      addListener: () => () => {},
    };

    // Ensure params are always an object, never undefined
    const safeParams = params || {};
    const routeProps = { navigation: mockNavigation as any, route: { params: safeParams, name: currentScreen } as any };
    const defaultRouteProps = { navigation: mockNavigation as any, route: { params: {}, name: currentScreen } as any };

    switch (currentScreen) {
      // Library screens
      case 'LibraryHome':
        return <LibraryScreen {...defaultRouteProps} />;
      case 'AddRecord':
        return <AddRecordScreen {...routeProps} />;
      case 'RecordDetail':
        return <RecordDetailScreen {...routeProps} />;
      case 'EditRecord':
        return <EditRecordScreen {...routeProps} />;
      case 'ScanRecord':
        return <ScanRecordScreen {...defaultRouteProps} />;
      case 'SongDetail':
        return <SongDetailScreen {...routeProps} />;
      case 'CSVImport':
        return <CSVImportScreen {...defaultRouteProps} />;
      case 'BatchScan':
        return <BatchScanScreen {...defaultRouteProps} />;
      case 'BatchReview':
        return <BatchReviewScreen {...routeProps} />;
      case 'DevTest':
        return <DevTestScreen {...defaultRouteProps} />;
      
      // Stands screens
      case 'RowsHome':
        return <StandsScreen {...defaultRouteProps} />;
      case 'RowDetail':
        return <RowDetailScreen {...routeProps} />;
      case 'UnitLayout':
        return <UnitLayoutScreen {...routeProps} />;
      
      // Modes screens
      case 'ModesHome':
        return <ModesScreen {...defaultRouteProps} />;
      case 'LoadModeStart':
        return <LoadModeStartScreen {...defaultRouteProps} />;
      case 'LoadModeFlow':
        return <LoadModeFlowScreen {...routeProps} />;
      case 'CleanupModeHome':
        return <CleanupModeHomeScreen {...defaultRouteProps} />;
      case 'CleanupModeFlow':
        return <CleanupModeFlowScreen {...routeProps} />;
      case 'ReorganizeModeStart':
        return <ReorganizeModeStartScreen {...defaultRouteProps} />;
      case 'ReorganizeModeFlow':
        return <ReorganizeModeFlowScreen {...routeProps} />;
      
      // Settings
      case 'Settings':
        return <SettingsScreen />;
      
      default:
        return <LibraryScreen {...defaultRouteProps} />;
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

  const getHomeScreenForTab = (tab: RootTab) => navigationHelpers.getHomeScreenForTab(tab);

  return (
    <NavigationContext.Provider value={{ navigate, goBack, canGoBack, currentScreen, params }}>
      <View style={styles.container}>
        <ShelfOfflineBanner />
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

