/**
 * Navigation Hooks
 * 
 * Compatibility layer for React Navigation hooks.
 * Re-exports our custom navigation hooks with React Navigation-compatible API.
 */

import { useContext } from 'react';
import { NavigationContext, useNavigation as useCustomNavigation } from './CustomNavigation';

// Re-export useNavigation from CustomNavigation
export { useCustomNavigation as useNavigation };

// useRoute hook for compatibility
export const useRoute = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    return {
      params: {},
      name: '',
    };
  }
  return {
    params: context.params || {},
    name: context.currentScreen || '',
  };
};

