// Compatibility layer for React Navigation hooks
// Re-exports our custom navigation hooks with React Navigation-compatible API
export { useNavigation } from './CustomNavigation';

// Mock useRoute hook for compatibility
import { useContext } from 'react';
import { NavigationContext } from './CustomNavigation';

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

