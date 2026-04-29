import { createContext, useContext } from 'react';

export type NavigationContextType = {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
  canGoBack: () => boolean;
  currentScreen: string;
  params: any;
};

export const NavigationContext = createContext<NavigationContextType | null>(null);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    return {
      navigate: () => {},
      goBack: () => {},
      canGoBack: () => false,
      currentScreen: '',
      params: {},
    };
  }
  return context;
};
