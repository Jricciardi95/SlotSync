// App.tsx
import React, { useEffect, useState, ErrorInfo } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initializeDatabase } from './src/data/database';
import { BatchScanProvider } from './src/contexts/BatchScanContext';
import { batchProcessingService } from './src/services/BatchProcessingService';
import { initializeApiBaseUrl } from './src/config/api';
import { logger } from './src/utils/logger';
import { initMonitoring } from './src/monitoring/initMonitoring';

/** Run before first render so preview/production builds capture early crashes. */
initMonitoring();

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.captureException(error, { screen: 'ErrorBoundary', componentStack: errorInfo.componentStack });
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <ScrollView contentContainerStyle={styles.errorContent}>
            <Text style={styles.errorTitle}>⚠️ App Error</Text>
            <Text style={styles.errorText}>{this.state.error?.message || 'Unknown error'}</Text>
            {this.state.errorInfo && (
              <Text style={styles.errorStack}>
                {this.state.errorInfo.componentStack}
              </Text>
            )}
            <Text style={styles.errorHint}>
              Check the console for more details. Try reloading the app (press 'r' in Expo).
            </Text>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        logger.debug('[App] Starting initialization');

        const apiInitPromise = initializeApiBaseUrl();
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 10000));
        await Promise.race([apiInitPromise, timeoutPromise]);
        logger.debug('[App] API base URL step finished');

        await initializeDatabase();
        logger.debug('[App] Database initialized');

        batchProcessingService.resumeAllJobs().catch((e) => logger.error('[App] Batch resume', e));

        setIsReady(true);
      } catch (error) {
        logger.captureException(error, { screen: 'App', phase: 'init' });
        setInitError(error as Error);
        // Still set ready to allow app to continue even if API init fails
        setIsReady(true);
      }
    };
    init();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#08F7FE" />
        {initError && (
          <View style={{ marginTop: 20, padding: 20 }}>
            <Text style={{ color: '#FF6B6B', textAlign: 'center' }}>
              Initialization warning: {initError.message}
            </Text>
            <Text style={{ color: '#999', textAlign: 'center', marginTop: 10, fontSize: 12 }}>
              App will continue but some features may not work
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <BatchScanProvider>
          <RootNavigator />
        </BatchScanProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111113', // Deep Charcoal from theme
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#111113',
    padding: 20,
  },
  errorContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorStack: {
    fontSize: 12,
    color: '#999',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  errorHint: {
    fontSize: 14,
    color: '#08F7FE',
    textAlign: 'center',
    marginTop: 20,
  },
});
