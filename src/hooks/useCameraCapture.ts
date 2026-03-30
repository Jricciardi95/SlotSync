/**
 * useCameraCapture Hook
 * 
 * Manages camera lifecycle, permissions, and capture logic.
 * Handles camera ready state, app state tracking, and photo capture with retries.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { convertToJpeg } from '../utils/imageConverter';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { logger } from '../utils/logger';

export interface UseCameraCaptureReturn {
  // State
  permission: ReturnType<typeof useCameraPermissions>[0];
  cameraReady: boolean;
  scanning: boolean;
  capturing: boolean;
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  
  // Refs (exposed for parent component)
  cameraRef: React.RefObject<CameraView>;
  
  // Actions
  capturePhoto: () => Promise<string | null>;
  setScanning: (value: boolean) => void;
  setCameraReady: (value: boolean) => void;
  
  // Camera event handlers
  onCameraReady: () => void;
  onBarcodeScanned: (event: { data: string }) => void;
}

interface UseCameraCaptureOptions {
  scanMode: 'image' | 'barcode';
  onBarcodeScanned?: (barcode: string) => void;
  onPhotoCaptured: (uri: string) => void;
  identifying?: boolean;
  capturedUri: string | null;
}

export function useCameraCapture({
  scanMode,
  onBarcodeScanned,
  onPhotoCaptured,
  identifying = false,
  capturedUri,
}: UseCameraCaptureOptions): UseCameraCaptureReturn {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const captureLockRef = useRef(false);
  const cameraSessionRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const cameraReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Consolidated mount-time initialization: camera logging, AppState listener
  useEffect(() => {
    logger.debug('[useCameraCapture] 📱 Hook mounted');
    logger.debug('[useCameraCapture] 📷 CameraView mount - cameraRef will be set');
    
    // Track app state to prevent captures when backgrounded
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      logger.debug('[useCameraCapture] 📱 App state changed:', appStateRef.current, '→', nextAppState);
      
      // Only reset cameraReady when going to/from 'background' state
      if (appStateRef.current === 'background' && nextAppState === 'active') {
        logger.debug('[useCameraCapture] 📱 App came to foreground from background - resetting cameraReady');
        setCameraReady(false);
      } else if (nextAppState === 'background') {
        logger.debug('[useCameraCapture] 📱 App went to background - resetting cameraReady');
        setCameraReady(false);
        if (cameraReadyTimeoutRef.current) {
          clearTimeout(cameraReadyTimeoutRef.current);
          cameraReadyTimeoutRef.current = null;
        }
      }
      
      appStateRef.current = nextAppState;
    });

    return () => {
      logger.debug('[useCameraCapture] 📱 Hook unmounting');
      logger.debug('[useCameraCapture] 📷 CameraView unmount - cleaning up');
      
      subscription.remove();
      
      if (cameraReadyTimeoutRef.current) {
        clearTimeout(cameraReadyTimeoutRef.current);
        cameraReadyTimeoutRef.current = null;
      }
      
      setCameraReady(false);
    };
  }, []);

  // Reset cameraReady when screen focuses/blurs
  useFocusEffect(
    useCallback(() => {
      logger.debug('[useCameraCapture] 🎯 Screen focused - resetting cameraReady');
      setCameraReady(false);
      setScanning(true);

      return () => {
        logger.debug('[useCameraCapture] 🎯 Screen blurred - resetting cameraReady');
        setCameraReady(false);
        setScanning(false);
        if (cameraReadyTimeoutRef.current) {
          clearTimeout(cameraReadyTimeoutRef.current);
          cameraReadyTimeoutRef.current = null;
        }
      };
    }, [])
  );

  // Reset cameraReady when scanMode changes
  useEffect(() => {
    logger.debug('[useCameraCapture] 🔄 Scan mode changed to:', scanMode, '- resetting cameraReady');
    setCameraReady(false);
    if (cameraReadyTimeoutRef.current) {
      clearTimeout(cameraReadyTimeoutRef.current);
      cameraReadyTimeoutRef.current = null;
    }
  }, [scanMode]);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const capturePhoto = useCallback(async (): Promise<string | null> => {
    logger.debug('[useCameraCapture] 📸 Capture photo called');
    
    if (captureLockRef.current || capturedUri) {
      logger.debug('[useCameraCapture] ⚠️ Capture blocked: already in progress or has captured image');
      return null;
    }
    
    if (appStateRef.current !== 'active') {
      logger.debug('[useCameraCapture] ⚠️ Capture blocked: app not in foreground (state:', appStateRef.current, ')');
      Alert.alert('Camera Not Available', 'Please bring the app to the foreground to take photos.');
      return null;
    }
    
    if (!cameraReady) {
      logger.debug('[useCameraCapture] ⚠️ Capture blocked: camera not ready');
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize.');
      return null;
    }
    
    if (capturing) {
      logger.debug('[useCameraCapture] ⚠️ Capture blocked: already capturing');
      return null;
    }
    
    if (!cameraRef.current) {
      logger.debug('[useCameraCapture] ⚠️ Capture blocked: camera ref is null');
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize.');
      return null;
    }
    
    captureLockRef.current = true;
    logger.debug('[useCameraCapture] 📸 Starting capture - resetting cameraReady');
    setCameraReady(false);

    try {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          Alert.alert('Camera Permission Required', 'Please allow camera access to take photos.');
          return null;
        }
      }

      setCapturing(true);

      const maxRetries = 3;
      let lastError: any = null;
      const sessionAtStart = cameraSessionRef.current;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt === 1) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          const delay = attempt === 1 ? 150 : attempt === 2 ? 700 : 1500;
          logger.debug(`[useCameraCapture] 📸 Capture attempt ${attempt}/${maxRetries} (delay ${delay}ms)`);
          await sleep(delay);

          if (appStateRef.current !== 'active') {
            logger.debug('[useCameraCapture] ⚠️ Capture aborted: app went to background (state:', appStateRef.current, ')');
            break;
          }

          if (sessionAtStart !== cameraSessionRef.current) {
            logger.debug('[useCameraCapture] ⚠️ Capture aborted: camera session changed (camera remounted)');
            break;
          }

          const cam = cameraRef.current as any;
          if (!cam?.takePictureAsync) {
            logger.debug('[useCameraCapture] ⚠️ Camera ref missing takePictureAsync, retrying…');
            continue;
          }

          logger.debug('[useCameraCapture] 📸 Calling takePictureAsync...');
          const photo = await cam.takePictureAsync({
            quality: 0.8,
            base64: false,
            skipProcessing: true,
            exif: false,
          });

          if (!photo?.uri) {
            logger.warn(`[useCameraCapture] ⚠️ No URI returned (attempt ${attempt}/${maxRetries})`);
            continue;
          }

          logger.debug('[useCameraCapture] ✅ Photo captured successfully:', photo.uri);

          const jpegUri = await convertToJpeg(photo.uri, {
            maxWidth: 1200,
            quality: 0.8,
          });

          setScanning(false);
          onPhotoCaptured(jpegUri);
          return jpegUri;
        } catch (error: any) {
          lastError = error;

          logger.error(`[useCameraCapture] ❌ Capture failed (attempt ${attempt}/${maxRetries}):`, {
            message: error?.message,
            code: error?.code,
            name: error?.name,
          });

          if (error?.code === 'ERR_CAMERA_IMAGE_CAPTURE' && attempt < maxRetries) {
            continue;
          }

          break;
        }
      }

      logger.error('[useCameraCapture] ❌ All capture attempts failed');
      Alert.alert(
        'Capture Failed',
        (lastError?.message || 'Could not capture photo.') + ' Please try again.',
        [{ text: 'OK', onPress: () => setScanning(true) }]
      );
      return null;
    } finally {
      captureLockRef.current = false;
      setCapturing(false);
    }
  }, [cameraReady, capturing, capturedUri, permission, onPhotoCaptured]);

  const onCameraReady = useCallback(() => {
    cameraSessionRef.current += 1;
    logger.debug('[useCameraCapture] 📷 onCameraReady fired - session=', cameraSessionRef.current);
    
    setCameraReady(false);
    
    if (cameraReadyTimeoutRef.current) {
      clearTimeout(cameraReadyTimeoutRef.current);
    }
    
    cameraReadyTimeoutRef.current = setTimeout(() => {
      const cam = cameraRef.current as any;
      const isAppActive = appStateRef.current === 'active';
      
      if (cam && cam.takePictureAsync && isAppActive) {
        logger.debug('[useCameraCapture] ✅ Camera ready (after stabilization) - ref verified, app active');
        setCameraReady(true);
        setScanning(true);
      } else {
        logger.warn('[useCameraCapture] ⚠️ Camera ready callback but conditions not met:', {
          hasRef: !!cam,
          hasMethod: !!cam?.takePictureAsync,
          appState: appStateRef.current,
          isAppActive,
        });
      }
      
      cameraReadyTimeoutRef.current = null;
    }, 150);
  }, []);

  const onBarcodeScannedHandler = useCallback((event: { data: string }) => {
    if (identifying || scanMode !== 'barcode' || capturing) return;
    
    const barcode = event.data;
    logger.debug(`[useCameraCapture] Barcode scanned: ${barcode}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    setScanning(false);
    
    if (onBarcodeScanned) {
      onBarcodeScanned(barcode);
    }
  }, [identifying, scanMode, capturing, onBarcodeScanned]);

  return {
    permission,
    cameraReady,
    scanning,
    capturing,
    requestPermission,
    cameraRef,
    capturePhoto,
    setScanning,
    setCameraReady,
    onCameraReady,
    onBarcodeScanned: onBarcodeScannedHandler,
  };
}

