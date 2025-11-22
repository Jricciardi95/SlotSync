import React, { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  TextInput,
  View,
  Image,
  TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppButton } from '../components/AppButton';
import { AppText } from '../components/AppText';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import { createRecord } from '../data/repository';
import { LibraryStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<LibraryStackParamList, 'AddRecord'>;

export const AddRecordScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, spacing } = useTheme();
  const { imageUri } = route.params || {};
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [artistLastName, setArtistLastName] = useState('');
  const [year, setYear] = useState('');
  const [notes, setNotes] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(imageUri || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (imageUri) {
      setCoverUri(imageUri);
    }
  }, [imageUri]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow photo access to attach cover art.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !artist.trim()) {
      Alert.alert('Missing info', 'Title and artist are required.');
      return;
    }
    setSaving(true);
    try {
      const newRecord = await createRecord({
        title: title.trim(),
        artist: artist.trim(),
        artistLastName: artistLastName.trim() || null,
        year: year ? Number(year) : null,
        notes: notes.trim() || null,
        coverImageLocalUri: coverUri,
      });
      
      console.log('[AddRecord] Record saved successfully:', {
        id: newRecord.id,
        artist: newRecord.artist,
        title: newRecord.title
      });
      
      // Navigate back - library will refresh via useFocusEffect
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', 'Please try again.');
      console.log(error);
    } finally {
      setSaving(false);
    }
  };

  const editImage = async () => {
    if (!coverUri) {
      pickImage();
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow photo access to edit cover art.'
      );
      return;
    }
    
    // Allow editing/cropping of existing image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio for album covers
      quality: 1.0,
    });
    
    if (!result.canceled && result.assets?.length) {
      setCoverUri(result.assets[0].uri);
    }
  };

  return (
    <AppScreen title="Add Record">
      <View style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
        <AppIconButton
          name="arrow-back"
          onPress={() => navigation.goBack()}
        />
      </View>
      <AppCard style={{ gap: spacing.md }}>
        <TouchableOpacity
          style={[
            styles.coverPicker,
            {
              borderColor: colors.borderSubtle,
              backgroundColor: colors.backgroundMuted,
            },
          ]}
          onPress={editImage}
        >
          {coverUri ? (
            <>
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
              <View style={[styles.editOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <AppText variant="caption" style={{ color: 'white' }}>
                  Tap to crop/edit
                </AppText>
              </View>
            </>
          ) : (
            <AppText variant="caption">Tap to add cover image</AppText>
          )}
        </TouchableOpacity>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Title*</AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Album title"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Artist*</AppText>
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="Artist name"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Artist Last Name</AppText>
          <TextInput
            value={artistLastName}
            onChangeText={setArtistLastName}
            placeholder="For sorting"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Year</AppText>
          <TextInput
            value={year}
            onChangeText={setYear}
            placeholder="e.g. 1977"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Notes</AppText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Pressing info, purchase notes..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={[
              styles.input,
              styles.notesInput,
              { color: colors.textPrimary, borderColor: colors.borderSubtle },
            ]}
          />
        </View>

        <AppButton title="Save Record" onPress={handleSave} disabled={saving} />
      </AppCard>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  coverPicker: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: 'center',
  },
  fieldGroup: {
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});

