import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { ModesStackParamList } from '../navigation/types';
import { getSessions, getSessionRecords } from '../data/repository';
import { Session } from '../data/types';
import { Ionicons } from '@expo/vector-icons';
import { logger } from '../utils/logger';

type Props = NativeStackScreenProps<ModesStackParamList, 'CleanupModeHome'>;

type SessionWithCount = Session & { recordCount: number; unreturnedCount: number };

export const CleanupModeHomeScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing } = useTheme();
  const [sessions, setSessions] = useState<SessionWithCount[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const allSessions = await getSessions();
      const sessionsWithCounts = await Promise.all(
        allSessions.map(async (session) => {
          const records = await getSessionRecords(session.id);
          const unreturned = records.filter((r) => !r.returnedAt);
          return {
            ...session,
            recordCount: records.length,
            unreturnedCount: unreturned.length,
          };
        })
      );
      setSessions(sessionsWithCounts);
    } catch (error) {
      logger.error('Failed to load sessions', error);
      Alert.alert('Error', 'Could not load sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const toggleSession = (sessionId: string) => {
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleStartCleanup = () => {
    const uncleanedSessions = sessions.filter(
      (s) => !s.cleanedUp && s.unreturnedCount > 0 && selectedSessions.has(s.id)
    );

    if (uncleanedSessions.length === 0) {
      Alert.alert('No sessions selected', 'Select sessions with unreturned records.');
      return;
    }

    navigation.navigate('CleanupModeFlow', {
      sessionIds: uncleanedSessions.map((s) => s.id),
    });
  };

  const uncleanedCount = sessions.filter((s) => !s.cleanedUp && s.unreturnedCount > 0).length;

  return (
    <AppScreen
      title="Clean-Up Mode"
      subtitle="Return records from listening sessions to their slots."
    >
      <ScrollView>
        {uncleanedCount > 0 && (
          <AppCard style={{ marginBottom: spacing.md, backgroundColor: colors.surface }}>
            <AppText variant="body">
              You have {uncleanedCount} session{uncleanedCount === 1 ? '' : 's'} not cleaned up.
            </AppText>
          </AppCard>
        )}

        {loading ? (
          <AppCard>
            <AppText variant="body">Loading sessions...</AppText>
          </AppCard>
        ) : sessions.length === 0 ? (
          <AppCard>
            <AppText variant="body">No sessions yet. Start a listening session from the Library.</AppText>
          </AppCard>
        ) : (
          sessions.map((session) => {
            const isSelected = selectedSessions.has(session.id);
            const canClean = !session.cleanedUp && session.unreturnedCount > 0;

            return (
              <AppCard
                key={session.id}
                style={[
                  isSelected && { borderColor: colors.accent, borderWidth: 2 },
                  !canClean && { opacity: 0.6 },
                ]}
              >
                <View style={styles.sessionHeader}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="subtitle">
                      {new Date(session.startedAt).toLocaleDateString()}
                    </AppText>
                    <AppText variant="caption" style={{ marginTop: 4 }}>
                      {new Date(session.startedAt).toLocaleTimeString()}
                      {session.endedAt && ` - ${new Date(session.endedAt).toLocaleTimeString()}`}
                    </AppText>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                  )}
                </View>

                <View style={styles.sessionStats}>
                  <AppText variant="caption">
                    {session.recordCount} record{session.recordCount === 1 ? '' : 's'}
                  </AppText>
                  {session.unreturnedCount > 0 && (
                    <AppText variant="caption" style={{ color: colors.accent }}>
                      {session.unreturnedCount} unreturned
                    </AppText>
                  )}
                  {session.cleanedUp && (
                    <AppText variant="caption" style={{ color: colors.textSecondary }}>
                      Cleaned up
                    </AppText>
                  )}
                </View>

                {canClean && (
                  <AppButton
                    title={isSelected ? 'Deselect' : 'Select'}
                    variant={isSelected ? 'primary' : 'secondary'}
                    onPress={() => toggleSession(session.id)}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </AppCard>
            );
          })
        )}

        {uncleanedCount > 0 && (
          <AppButton
            title="Begin Cleanup Mode"
            onPress={handleStartCleanup}
            disabled={selectedSessions.size === 0}
            style={{ marginTop: spacing.xl }}
          />
        )}
      </ScrollView>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
});

