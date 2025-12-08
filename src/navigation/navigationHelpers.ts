/**
 * Navigation Helpers
 * 
 * Shared utilities and types for navigation.
 * This file breaks circular dependencies by providing a single source of truth.
 */

// Re-export types from types.ts to avoid circular imports
export type {
  RootTabParamList,
  LibraryStackParamList,
  StandsStackParamList,
  ModesStackParamList,
} from './types';

/**
 * Navigation helper functions
 */
export const navigationHelpers = {
  /**
   * Get the home screen name for a tab
   */
  getHomeScreenForTab: (tab: 'Library' | 'Stands' | 'Modes' | 'Batch' | 'Settings'): string => {
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
  },

  /**
   * Get the stack key for a tab
   */
  getStackKey: (tab: 'Library' | 'Stands' | 'Modes' | 'Batch' | 'Settings'): 'libraryStack' | 'standsStack' | 'modesStack' | 'batchStack' => {
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
  },

  /**
   * Check if a screen belongs to a specific tab
   */
  getTabForScreen: (screen: string): 'Library' | 'Stands' | 'Modes' | 'Batch' | 'Settings' => {
    if (screen === 'LibraryHome' || screen.startsWith('Library') || 
        screen === 'AddRecord' || screen === 'RecordDetail' || 
        screen === 'EditRecord' || screen === 'ScanRecord' || 
        screen === 'SongDetail' || screen === 'CSVImport' || 
        screen === 'DevTest') {
      return 'Library';
    } else if (screen === 'RowsHome' || screen === 'RowDetail' || screen === 'UnitLayout') {
      return 'Stands';
    } else if (screen === 'ModesHome' || screen.startsWith('LoadMode') || 
               screen.startsWith('CleanupMode') || screen.startsWith('ReorganizeMode')) {
      return 'Modes';
    } else if (screen === 'BatchScan' || screen === 'BatchReview') {
      return 'Batch';
    }
    return 'Library'; // Default
  },
};

