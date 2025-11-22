// App.tsx
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initializeDatabase } from './src/data/database';
import { BatchScanProvider } from './src/contexts/BatchScanContext';
import { batchProcessingService } from './src/services/BatchProcessingService';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeDatabase();
        
        // Resume any background batch processing jobs
        batchProcessingService.resumeAllJobs().catch(console.error);
        
        setIsReady(true);
      } catch (error) {
        console.warn('Failed to initialize database', error);
        // Still set ready to allow app to continue
        setIsReady(true);
      }
    };
    init();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#08F7FE" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <BatchScanProvider>
        <RootNavigator />
      </BatchScanProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111113', // Deep Charcoal from theme
  },
});
