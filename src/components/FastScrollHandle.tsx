import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import * as Haptics from 'expo-haptics';

interface FastScrollHandleProps {
  listRef: React.RefObject<any>;
  scrollPosition: number;
  onScroll: (progress: number) => void;
  visible: boolean;
}

export const FastScrollHandle: React.FC<FastScrollHandleProps> = ({
  listRef,
  scrollPosition,
  onScroll,
  visible,
}) => {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const containerLayoutRef = useRef<{ height: number } | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartProgressRef = useRef(0);
  const hasTriggeredHapticRef = useRef(false);

  // Show/hide animation
  useEffect(() => {
    if (visible || isDragging) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, isDragging, opacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: (evt) => {
        if (!hasTriggeredHapticRef.current) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          hasTriggeredHapticRef.current = true;
        }
        setIsDragging(true);
        if (containerLayoutRef.current) {
          dragStartYRef.current = evt.nativeEvent.locationY;
          dragStartProgressRef.current = scrollPosition;
        }
      },
      onPanResponderMove: (evt) => {
        if (containerLayoutRef.current && isDragging) {
          const deltaY = evt.nativeEvent.locationY - dragStartYRef.current;
          const deltaProgress = deltaY / containerLayoutRef.current.height;
          const newProgress = Math.max(0, Math.min(1, dragStartProgressRef.current + deltaProgress));
          onScroll(newProgress);
        }
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        hasTriggeredHapticRef.current = false;
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        hasTriggeredHapticRef.current = false;
      },
    })
  ).current;

  const handleHeight = 60;
  const screenHeight = Dimensions.get('window').height;
  const maxTop = Math.max(0, 1 - (handleHeight / screenHeight));
  const handleTopPercent = scrollPosition * maxTop * 100;

  if (!visible && !isDragging) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
        },
      ]}
      onLayout={(evt) => {
        const { height } = evt.nativeEvent.layout;
        containerLayoutRef.current = { height };
      }}
      pointerEvents={visible || isDragging ? 'auto' : 'none'}
    >
      <View
        style={[
          styles.handle,
          {
            top: `${handleTopPercent}%`,
            backgroundColor: colors.textMuted,
          },
        ]}
        {...panResponder.panHandlers}
      />
    </Animated.View>
  );
};

export const useFastScrollHandle = (
  listRef: React.RefObject<any>,
  onScrollToProgress?: (progress: number) => void
) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollableHeight = contentSize.height - layoutMeasurement.height;
    
    if (scrollableHeight > 0) {
      const progress = contentOffset.y / scrollableHeight;
      setScrollProgress(Math.max(0, Math.min(1, progress)));
    } else {
      setScrollProgress(0);
    }

    if (!isScrolling) {
      setIsScrolling(true);
    }

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 2000);
  };

  return {
    scrollProgress,
    isScrolling,
    handleScroll,
  };
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 30,
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  handle: {
    position: 'absolute',
    right: 0,
    width: 4,
    height: 60,
    borderRadius: 2,
    opacity: 0.6,
  },
});
