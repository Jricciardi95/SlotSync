import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { AppText } from '../components/AppText';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StandsNavigator } from './StandsNavigator';
import { LibraryNavigator } from './LibraryNavigator';
import { ModesNavigator } from './ModesNavigator';

type Tab = 'Library' | 'Stands' | 'Modes' | 'Settings';

export const CustomTabNavigator: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('Library');
  const { colors, spacing } = useTheme();

  const tabs: { name: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { name: 'Library', icon: 'albums', label: 'Library' },
    { name: 'Stands', icon: 'grid', label: 'Stands' },
    { name: 'Modes', icon: 'options', label: 'Modes' },
    { name: 'Settings', icon: 'settings', label: 'Settings' },
  ];

  const renderContent = () => {
    // Test: Try rendering screens directly first to see if Stack Navigators work
    switch (activeTab) {
      case 'Library':
        // Temporarily render LibraryScreen directly to test
        const { LibraryScreen } = require('../screens/LibraryScreen');
        return <LibraryScreen navigation={{} as any} route={{} as any} />;
      case 'Stands':
        const { StandsScreen } = require('../screens/StandsScreen');
        return <StandsScreen navigation={{} as any} route={{} as any} />;
      case 'Modes':
        const { ModesScreen } = require('../screens/ModesScreen');
        return <ModesScreen navigation={{} as any} route={{} as any} />;
      case 'Settings':
        return <SettingsScreen />;
      default:
        const { LibraryScreen: DefaultScreen } = require('../screens/LibraryScreen');
        return <DefaultScreen navigation={{} as any} route={{} as any} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderContent()}</View>
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
          const isActive = activeTab === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => setActiveTab(tab.name)}
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
                  marginTop: 4,
                }}
              >
                {tab.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 70,
    borderTopWidth: 1,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

