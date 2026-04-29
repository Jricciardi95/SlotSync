import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from './AppScreen';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { useTheme } from '../hooks/useTheme';
import {
  clearStoredShelfBaseUrl,
  getStoredShelfBaseUrl,
  getShelfAutoHighlightEnabled,
  normalizeShelfBaseUrl,
  setShelfAutoHighlightEnabled,
  setStoredShelfBaseUrl,
} from '../services/shelfApi/storage';
import { formatShelfFailureForUser } from '../services/shelfApi/shelfUserMessages';
import {
  shelfBlinkSlot,
  shelfClear,
  shelfDemo,
  shelfGetStatus,
  shelfIdle,
  shelfSelectSlot,
  shelfSetBrightness,
} from '../services/shelfApi/shelfApi';
import { ShelfApiError, ShelfNotConfiguredError } from '../services/shelfApi/types';
import {
  getShelfConnectionSnapshot,
  subscribeShelfConnection,
} from '../services/shelfApi/connectionState';
import { logger } from '../utils/logger';

type Props = {
  onBack: () => void;
};

export const ShelfConnectionPanel: React.FC<Props> = ({ onBack }) => {
  const { colors, spacing, radius } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { paddingBottom: 32 },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        mb: { marginBottom: spacing.sm },
        mt: { marginTop: spacing.md },
        mtSm: { marginTop: spacing.sm },
        mtCard: { marginTop: spacing.md },
        backRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.md,
        },
        input: {
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          color: colors.textPrimary,
          backgroundColor: colors.backgroundMuted,
          fontSize: 16,
        },
        mono: { fontFamily: 'Courier', fontSize: 11 },
        devGrid: { gap: spacing.sm },
      }),
    [colors, spacing, radius]
  );

  const [input, setInput] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastJson, setLastJson] = useState<string>('');
  const [, bump] = useState(0);
  const [autoHighlight, setAutoHighlight] = useState(true);

  useEffect(() => {
    return subscribeShelfConnection(() => bump((n) => n + 1));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const u = await getStoredShelfBaseUrl();
        setSavedUrl(u);
        if (u) {
          const withoutProto = u.replace(/^https?:\/\//i, '');
          setInput(withoutProto);
        }
        setAutoHighlight(await getShelfAutoHighlightEnabled());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const snapshot = getShelfConnectionSnapshot();

  const handleSave = async () => {
    try {
      const normalized = normalizeShelfBaseUrl(input);
      await setStoredShelfBaseUrl(normalized);
      setSavedUrl(normalized);
      Alert.alert('Saved', `Shelf base URL:\n${normalized}`);
    } catch (e: any) {
      Alert.alert('Invalid URL', e?.message ?? 'Check the address and try again.');
    }
  };

  const handleClearSaved = async () => {
    await clearStoredShelfBaseUrl();
    setSavedUrl(null);
    setInput('');
    Alert.alert('Cleared', 'Shelf URL removed from this device.');
  };

  const runWithBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleTest = () =>
    runWithBusy(async () => {
      try {
        const data = await shelfGetStatus();
        setLastJson(JSON.stringify(data, null, 2));
        Alert.alert('Connected', `Mode: ${data.mode ?? '?'}\nMax slot: ${data.max_slot ?? '?'}`);
      } catch (e) {
        setLastJson('');
        if (e instanceof ShelfNotConfiguredError) {
          Alert.alert('Not configured', e.message);
        } else if (e instanceof ShelfApiError) {
          Alert.alert('Request failed', e.message);
        } else {
          Alert.alert('Error', String(e));
        }
      }
    });

  const devAction = useCallback(
    (label: string, fn: () => Promise<unknown>) => () =>
      runWithBusy(async () => {
        try {
          const out = await fn();
          setLastJson(JSON.stringify(out, null, 2));
          logger.debug(`[shelf dev] ${label}`, out);
        } catch (e) {
          logger.warn(`[shelf dev] ${label}`, e);
          Alert.alert(label, e instanceof Error ? e.message : String(e));
        }
      }),
    []
  );

  if (loading) {
    return (
      <AppScreen title="Smart shelf" scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Smart shelf" subtitle="LAN connection to ESP32" scroll={false}>
      <TouchableOpacity onPress={onBack} style={styles.backRow} accessibilityRole="button">
        <Ionicons name="chevron-back" size={22} color={colors.accent} />
        <AppText variant="body" style={{ color: colors.accent, marginLeft: 4 }}>
          Back to settings
        </AppText>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <AppCard>
          <AppText variant="subtitle" style={styles.mb}>
            Private beta note
          </AppText>
          <AppText variant="body" style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
            Shelf lighting is optional. Scanning, identification, and your library work without it. To use LEDs,
            your phone and the ESP32 must be on the same Wi‑Fi; there is no cloud shelf yet.
          </AppText>
          <AppText variant="caption" style={{ color: colors.textMuted }}>
            If connection fails, check the IP, Wi‑Fi, and firewall — the rest of the app still works.
          </AppText>
        </AppCard>

        <AppCard style={styles.mtCard}>
          <AppText variant="subtitle" style={styles.mb}>
            Shelf address
          </AppText>
          <AppText variant="caption" style={[styles.mb, { color: colors.textMuted }]}>
            Enter your ESP32 IP (same Wi‑Fi as this phone). Example: 192.168.1.50 — http:// is added
            automatically.
          </AppText>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="192.168.x.x"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
          <AppButton title="Save" onPress={handleSave} style={styles.mt} />
          <AppButton
            title="Test connection"
            variant="secondary"
            onPress={handleTest}
            style={styles.mtSm}
            disabled={busy}
          />
          <AppButton
            title="Clear saved URL"
            variant="ghost"
            onPress={handleClearSaved}
            style={styles.mtSm}
          />
        </AppCard>

        <AppCard style={styles.mtCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <AppText variant="subtitle" style={styles.mb}>
                Auto-light shelf when opening an album
              </AppText>
              <AppText variant="caption" style={{ color: colors.textMuted }}>
                When off, LEDs only change when you use shelf modes or tap Light on the album screen.
              </AppText>
            </View>
            <Switch
              value={autoHighlight}
              onValueChange={(v) => {
                setAutoHighlight(v);
                void setShelfAutoHighlightEnabled(v);
              }}
              trackColor={{ false: colors.borderSubtle, true: colors.accentMuted }}
              thumbColor={autoHighlight ? colors.accent : colors.textMuted}
            />
          </View>
        </AppCard>

        <AppCard style={styles.mtCard}>
          <AppText variant="subtitle" style={styles.mb}>
            Connection health
          </AppText>
          <AppText variant="body">
            Saved URL: {savedUrl ?? 'Not set — shelf lighting uses unit IP from Stands if available'}
          </AppText>
          <AppText variant="body" style={styles.mtSm}>
            Last success:{' '}
            {snapshot.lastSuccessAt
              ? new Date(snapshot.lastSuccessAt).toLocaleTimeString()
              : '—'}
          </AppText>
          {snapshot.lastError ? (
            <AppText variant="caption" style={{ color: colors.error, marginTop: 8 }}>
              Last issue: {formatShelfFailureForUser(snapshot.lastError)}
            </AppText>
          ) : null}
        </AppCard>

        {lastJson ? (
          <AppCard style={styles.mtCard}>
            <AppText variant="subtitle" style={styles.mb}>
              Last response
            </AppText>
            <AppText variant="caption" style={styles.mono}>
              {lastJson}
            </AppText>
          </AppCard>
        ) : null}

        {__DEV__ ? (
          <AppCard style={styles.mtCard}>
            <AppText variant="subtitle" style={styles.mb}>
              Developer controls
            </AppText>
            <AppText variant="caption" style={[styles.mb, { color: colors.textMuted }]}>
              Quick taps for bench testing. Uses saved shelf URL.
            </AppText>
            <View style={styles.devGrid}>
              <AppButton
                title="Get status"
                onPress={devAction('status', () => shelfGetStatus())}
                disabled={busy}
              />
              <AppButton title="Idle" onPress={devAction('idle', () => shelfIdle())} disabled={busy} />
              <AppButton title="Clear" onPress={devAction('clear', () => shelfClear())} disabled={busy} />
              <AppButton title="Demo" onPress={devAction('demo', () => shelfDemo())} disabled={busy} />
              <AppButton
                title="Select slot 1"
                onPress={devAction('slot 1', () => shelfSelectSlot(1))}
                disabled={busy}
              />
              <AppButton
                title="Blink slot 1"
                onPress={devAction('blink 1', () => shelfBlinkSlot(1))}
                disabled={busy}
              />
              <AppButton
                title="Brightness 120"
                onPress={devAction('brightness', () => shelfSetBrightness(120))}
                disabled={busy}
              />
            </View>
          </AppCard>
        ) : null}
      </ScrollView>
    </AppScreen>
  );
};
