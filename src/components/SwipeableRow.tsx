import React, { useRef, useEffect } from 'react';
import {
  View,
  Animated,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const BUTTON_WIDTH = 80;
const SWIPE_THRESHOLD = BUTTON_WIDTH / 2; // Half the button width
const VELOCITY_THRESHOLD = 500; // pixels per second

interface SwipeableRowProps {
  children: React.ReactNode;
  itemId: string;
  isOpen: boolean; // Controlled by parent - true when this row is the open one
  onOpen: () => void; // Called when this row should open
  onClose: () => void; // Called when this row should close
  onDelete: () => void;
  onPress?: () => void; // Normal row action (only called when row is closed)
  hasAnyRowOpen: boolean; // True if ANY row is currently open (for tap-to-close)
}

export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  children,
  itemId,
  isOpen,
  onOpen,
  onClose,
  onDelete,
  onPress,
  hasAnyRowOpen,
}) => {
  const { radius, colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const panStartX = useRef(0);
  const isAnimatingRef = useRef(false);
  const isDraggingRef = useRef(false);

  // Sync translateX with isOpen prop (when parent controls it)
  useEffect(() => {
    if (!isDraggingRef.current && !isAnimatingRef.current) {
      const targetValue = isOpen ? -BUTTON_WIDTH : 0;
      
      // Get current value and animate if needed
      translateX.stopAnimation((currentValue) => {
        // Only animate if we're not already at the target
        if (Math.abs(currentValue - targetValue) > 1) {
          isAnimatingRef.current = true;
          Animated.spring(translateX, {
            toValue: targetValue,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start(() => {
            isAnimatingRef.current = false;
          });
        }
      });
    }
  }, [isOpen, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes (more horizontal than vertical)
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasMovement = Math.abs(gestureState.dx) > 8;
        return isHorizontal && hasMovement && !isAnimatingRef.current;
      },
      onPanResponderGrant: (_, gestureState) => {
        // Stop any ongoing animation and capture current position
        translateX.stopAnimation((value) => {
          panStartX.current = value;
        });
        isAnimatingRef.current = false;
        isDraggingRef.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isDraggingRef.current) return;
        
        // Calculate new position: start position + gesture movement
        const newX = panStartX.current + gestureState.dx;
        
        // Clamp strictly between 0 (closed) and -BUTTON_WIDTH (fully open)
        if (newX <= 0 && newX >= -BUTTON_WIDTH) {
          translateX.setValue(newX);
        } else if (newX < -BUTTON_WIDTH) {
          translateX.setValue(-BUTTON_WIDTH);
        } else if (newX > 0) {
          translateX.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingRef.current = false;
        const finalX = panStartX.current + gestureState.dx;
        const velocity = gestureState.vx;

        // Determine final state: either fully closed (0) or fully open (-BUTTON_WIDTH)
        const shouldOpen = finalX < -SWIPE_THRESHOLD || velocity < -VELOCITY_THRESHOLD;

        isAnimatingRef.current = true;
        
        if (shouldOpen) {
          // Snap to fully open
          Animated.spring(translateX, {
            toValue: -BUTTON_WIDTH,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start(() => {
            isAnimatingRef.current = false;
            onOpen(); // Notify parent that this row is now open
          });
        } else {
          // Snap to fully closed
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start(() => {
            isAnimatingRef.current = false;
            if (isOpen) {
              onClose(); // Notify parent that this row is now closed
            }
          });
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        // If gesture is interrupted, snap back to current state
        translateX.stopAnimation((value) => {
          const targetValue = value < -SWIPE_THRESHOLD ? -BUTTON_WIDTH : 0;
          isAnimatingRef.current = true;
          Animated.spring(translateX, {
            toValue: targetValue,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start(() => {
            isAnimatingRef.current = false;
            if (targetValue === -BUTTON_WIDTH && !isOpen) {
              onOpen();
            } else if (targetValue === 0 && isOpen) {
              onClose();
            }
          });
        });
      },
    })
  ).current;

  const handleDelete = () => {
    // Animate out to the left before deleting
    isAnimatingRef.current = true;
    Animated.timing(translateX, {
      toValue: -Dimensions.get('window').width,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDelete();
      // Reset after deletion (will be cleaned up by parent)
      translateX.setValue(0);
      isAnimatingRef.current = false;
      onClose();
    });
  };

  const handleRowPress = () => {
    // CRITICAL: If ANY row is open, close it first (tap-to-close behavior)
    if (hasAnyRowOpen) {
      // Close the open row (which might be this one or another)
      onClose();
      return;
    }
    
    // Only trigger normal action when no row is open
    onPress?.();
  };

  return (
    <View style={styles.container}>
      {/* Delete button - red rectangle with gray circle and red minus */}
      <View
        style={[
          styles.deleteButton,
          {
            backgroundColor: '#FF3B30', // Red rectangle
            borderRadius: radius.md,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleDelete}
          activeOpacity={0.7}
          style={styles.deleteButtonTouchable}
        >
          <View
            style={[
              styles.deleteIconContainer,
              {
                backgroundColor: '#8E8E93', // Gray circle
                borderRadius: 20,
              },
            ]}
          >
            <Ionicons name="remove" size={20} color="#FF3B30" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Content - covers delete button, swipeable */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX }],
            backgroundColor: colors.background, // Match screen background to hide delete button
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={handleRowPress}
          style={styles.touchableContent}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    marginBottom: 0, // Let parent handle spacing
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  deleteButtonTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    zIndex: 1,
  },
  touchableContent: {
    width: '100%',
  },
});
