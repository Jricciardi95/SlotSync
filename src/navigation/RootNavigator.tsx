import React from 'react';
import { CustomNavigation } from './CustomNavigation';

// Using custom navigation that works with React 19
// This replaces React Navigation to avoid compatibility issues
export const RootNavigator: React.FC = () => {
  return <CustomNavigation />;
};
