import { useEffect, useRef } from 'react';

// Custom useFocusEffect hook that works with our custom navigation
// Mimics React Navigation's useFocusEffect behavior
// For now, runs on mount and cleanup on unmount (similar behavior)
export const useFocusEffect = (callback: () => void | (() => void)) => {
  const callbackRef = useRef(callback);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // Run callback when component mounts (screen comes into focus)
    const cleanup = callbackRef.current();
    
    // Return cleanup function if provided
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, []); // Run once on mount, cleanup on unmount
};

