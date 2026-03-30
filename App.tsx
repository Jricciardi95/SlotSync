// App.tsx
import React, { useEffect, useState, ErrorInfo } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initializeDatabase } from './src/data/database';
import { BatchScanProvider } from './src/contexts/BatchScanContext';
import { batchProcessingService } from './src/services/BatchProcessingService';
import { initializeApiBaseUrl } from './src/config/api';

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
    console.error('[App] ❌ Error Boundary caught error:', error, errorInfo);
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

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('[App] 🚀 Starting initialization...');
        
        // Initialize API base URL first (with health checks)
        // Add timeout to prevent hanging forever
        console.log('[App] 📡 Initializing API base URL...');
        const apiInitPromise = initializeApiBaseUrl();
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 10000)); // 10s timeout
        await Promise.race([apiInitPromise, timeoutPromise]);
        console.log('[App] ✅ API base URL initialized');
        
        console.log('[App] 💾 Initializing database...');
        await initializeDatabase();
        console.log('[App] ✅ Database initialized');
        
        // Resume any background batch processing jobs
        batchProcessingService.resumeAllJobs().catch(console.error);
        
        console.log('[App] ✅ Initialization complete');
        setIsReady(true);
      } catch (error) {
        console.error('[App] ❌ Failed to initialize app', error);
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
