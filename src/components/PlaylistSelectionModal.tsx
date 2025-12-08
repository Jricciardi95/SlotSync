import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '../hooks/useTheme';
import {
  getPlaylists,
  createPlaylist,
  addRecordToPlaylist,
  addTrackToPlaylist,
} from '../data/repository';
import { Playlist } from '../data/types';

interface PlaylistSelectionModalProps {
  visible: boolean;
  recordId?: string; // For albums
  trackId?: string; // For songs
  onClose: () => void;
  onAdded?: () => void;
}

export const PlaylistSelectionModal: React.FC<PlaylistSelectionModalProps> = ({
  visible,
  recordId,
  trackId,
  onClose,
  onAdded,
}) => {
  const { colors, spacing, radius } = useTheme();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPlaylists();
    } else {
      // Reset state when modal closes
      setNewPlaylistName('');
      setShowCreateInput(false);
    }
  }, [visible]);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const allPlaylists = await getPlaylists();
      setPlaylists(allPlaylists);
    } catch (error) {
      console.error('Failed to load playlists:', error);
      Alert.alert('Error', 'Could not load playlists.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      if (recordId) {
        await addRecordToPlaylist(playlistId, recordId);
        Alert.alert('Success', 'Album added to playlist!');
      } else if (trackId) {
        await addTrackToPlaylist(playlistId, trackId);
        Alert.alert('Success', 'Song added to playlist!');
      } else {
        Alert.alert('Error', 'No item selected.');
        return;
      }
      onAdded?.();
      onClose();
    } catch (error) {
      console.error('Failed to add to playlist:', error);
      Alert.alert('Error', 'Could not add item to playlist.');
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Error', 'Please enter a playlist name.');
      return;
    }

    setCreating(true);
    try {
      const newPlaylist = await createPlaylist(newPlaylistName.trim());
      if (recordId) {
        await addRecordToPlaylist(newPlaylist.id, recordId);
        Alert.alert('Success', 'Playlist created and album added!');
      } else if (trackId) {
        await addTrackToPlaylist(newPlaylist.id, trackId);
        Alert.alert('Success', 'Playlist created and song added!');
      } else {
        Alert.alert('Error', 'No item selected.');
        return;
      }
      await loadPlaylists();
      setNewPlaylistName('');
      setShowCreateInput(false);
      onAdded?.();
      onClose();
    } catch (error) {
      console.error('Failed to create playlist:', error);
      Alert.alert('Error', 'Could not create playlist.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          style={styles.keyboardAvoidingView}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.backgroundMuted,
                borderRadius: radius.lg,
              },
            ]}
          >
          <View style={styles.header}>
            <AppText variant="subtitle">Add to Playlist</AppText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <>
                {!showCreateInput ? (
                  <TouchableOpacity
                    onPress={() => setShowCreateInput(true)}
                    style={[
                      styles.createButton,
                      {
                        backgroundColor: colors.surfaceAlt,
                        borderColor: colors.borderSubtle,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Ionicons name="add" size={20} color={colors.accent} />
                    <AppText variant="body" style={{ marginLeft: spacing.sm }}>
                      Create New Playlist
                    </AppText>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={[
                      styles.createInputContainer,
                      {
                        backgroundColor: colors.surfaceAlt,
                        borderColor: colors.borderSubtle,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <TextInput
                      value={newPlaylistName}
                      onChangeText={setNewPlaylistName}
                      placeholder="Playlist name"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.input,
                        {
                          color: colors.textPrimary,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                      autoFocus
                    />
                    <View style={styles.createActions}>
                      <AppButton
                        title="Cancel"
                        variant="ghost"
                        onPress={() => {
                          setShowCreateInput(false);
                          setNewPlaylistName('');
                        }}
                        style={{ flex: 1, marginRight: spacing.xs }}
                      />
                      <AppButton
                        title={creating ? 'Creating...' : 'Create'}
                        onPress={handleCreatePlaylist}
                        disabled={creating || !newPlaylistName.trim()}
                        style={{ flex: 1, marginLeft: spacing.xs }}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.playlistList}>
                  {playlists.length === 0 ? (
                    <View style={styles.emptyState}>
                      <AppText variant="body" style={{ color: colors.textSecondary }}>
                        No playlists yet. Create one to get started!
                      </AppText>
                    </View>
                  ) : (
                    playlists.map((playlist) => (
                      <TouchableOpacity
                        key={playlist.id}
                        onPress={() => handleAddToPlaylist(playlist.id)}
                        style={[
                          styles.playlistItem,
                          {
                            backgroundColor: colors.surfaceAlt,
                            borderColor: colors.borderSubtle,
                            borderRadius: radius.md,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <AppText variant="body">{playlist.name}</AppText>
                          {playlist.description && (
                            <AppText
                              variant="caption"
                              style={{ color: colors.textSecondary, marginTop: spacing.xs }}
                            >
                              {playlist.description}
                            </AppText>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </>
            )}
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  keyboardAvoidingView: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.85, // 85% of screen height max
  },
  modalContent: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.75, // 75% of screen height max - ensures it stays visible
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16, // Safe area for iOS
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  scrollContent: {
    flexGrow: 0, // Don't grow beyond container
    flexShrink: 1, // Allow shrinking if needed
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  createInputContainer: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  createActions: {
    flexDirection: 'row',
    gap: 8,
  },
  playlistList: {
    // ScrollView will handle scrolling
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
});

