import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { createRecord } from '../data/repository';
import { LibraryStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl, API_CONFIG } from '../config/api';
import { createTrack } from '../data/repository';

type Props = NativeStackScreenProps<LibraryStackParamList, 'CSVImport'>;

type ColumnMapping = {
  artist?: string;
  title?: string;
  year?: string;
  notes?: string;
  barcode?: string;
  releaseId?: string;
};

export const CSVImportScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (currentField || currentLine.length > 0) {
          currentLine.push(currentField.trim());
          currentField = '';
        }
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
        }
      } else {
        currentField += char;
      }
    }

    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      lines.push(currentLine);
    }

    return lines;
  };

  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const lines = parseCSV(fileContent);

      if (lines.length === 0) {
        Alert.alert('Error', 'CSV file is empty.');
        return;
      }

      const headers = lines[0];
      setCsvHeaders(headers);

      // Auto-detect common column names
      const autoMapping: ColumnMapping = {};
      headers.forEach((header, idx) => {
        const lower = header.toLowerCase();
        if (lower.includes('artist') || lower.includes('performer')) {
          autoMapping.artist = header;
        } else if (lower.includes('title') || lower.includes('album') || lower.includes('release title')) {
          autoMapping.title = header;
        } else if (lower.includes('release id') || lower === 'release id') {
          autoMapping.releaseId = header;
        } else if ((lower.includes('year') || lower.includes('date')) && 
                   !lower.includes('date added') && 
                   !lower.includes('date modified') &&
                   !lower.includes('added') &&
                   !lower.includes('modified')) {
          autoMapping.year = header;
        } else if (lower.includes('notes') || lower.includes('comment') || lower.includes('collection notes')) {
          autoMapping.notes = header;
        } else if (lower.includes('barcode') || lower.includes('catalog')) {
          autoMapping.barcode = header;
        }
      });

      setMapping(autoMapping);
    } catch (error) {
      console.error('File selection failed', error);
      Alert.alert('Error', 'Could not read CSV file.');
    }
  };

  const handleImport = async () => {
    if (!mapping.artist || !mapping.title) {
      Alert.alert('Missing mapping', 'Artist and Title columns are required.');
      return;
    }

    setImporting(true);
    setImportedCount(0);
    setSkippedCount(0);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const lines = parseCSV(fileContent);

      if (lines.length < 2) {
        Alert.alert('Error', 'CSV file has no data rows.');
        setImporting(false);
        return;
      }

      const headers = lines[0];
      const dataRows = lines.slice(1);

      const artistIdx = headers.indexOf(mapping.artist);
      const titleIdx = headers.indexOf(mapping.title);
      const yearIdx = mapping.year ? headers.indexOf(mapping.year) : -1;
      const notesIdx = mapping.notes ? headers.indexOf(mapping.notes) : -1;
      const barcodeIdx = mapping.barcode ? headers.indexOf(mapping.barcode) : -1;
      const releaseIdIdx = mapping.releaseId ? headers.indexOf(mapping.releaseId) : -1;

      let imported = 0;
      let skipped = 0;

      for (const row of dataRows) {
        if (row.length <= Math.max(artistIdx, titleIdx)) {
          skipped += 1;
          continue;
        }

        const artist = row[artistIdx]?.trim();
        const title = row[titleIdx]?.trim();

        if (!artist || !title) {
          skipped += 1;
          continue;
        }

        try {
          let year = yearIdx >= 0 ? parseInt(row[yearIdx] || '0', 10) : null;
          year = year && !isNaN(year) && year > 1900 && year < 2100 ? year : null;
          
          const notesParts: string[] = [];
          if (notesIdx >= 0 && row[notesIdx]) {
            notesParts.push(row[notesIdx].trim());
          }
          if (barcodeIdx >= 0 && row[barcodeIdx]) {
            notesParts.push(`Barcode: ${row[barcodeIdx].trim()}`);
          }

          let coverImageRemoteUrl: string | null = null;
          let tracks: Array<{ title: string; trackNumber?: number | null }> = [];
          let discogsReleaseId: number | null = null;

          // If Release ID exists, fetch full metadata from Discogs
          if (releaseIdIdx >= 0 && row[releaseIdIdx]) {
            const releaseIdStr = row[releaseIdIdx]?.trim();
            const releaseId = parseInt(releaseIdStr, 10);
            
            if (releaseId && !isNaN(releaseId)) {
              discogsReleaseId = releaseId;
              try {
                console.log(`[CSV Import] Fetching Discogs release ${releaseId}...`);
                const apiUrl = getApiUrl('/api/discogs/release/' + releaseId);
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                });

                if (response.ok) {
                  const discogsData = await response.json();
                  coverImageRemoteUrl = discogsData.coverImageRemoteUrl || null;
                  tracks = discogsData.tracks || [];
                  // Use Discogs year if we don't have one or if it's more reliable
                  if (!year || (discogsData.year && discogsData.year > 1900 && discogsData.year < 2100)) {
                    year = discogsData.year || year;
                  }
                  console.log(`[CSV Import] ✅ Fetched metadata for ${artist} - ${title}: ${tracks.length} tracks`);
                } else {
                  console.warn(`[CSV Import] ⚠️  Could not fetch Discogs release ${releaseId}: ${response.status}`);
                }
              } catch (fetchError) {
                console.warn(`[CSV Import] ⚠️  Error fetching Discogs release ${releaseId}:`, fetchError);
                // Continue with basic data
              }
            }
          } else {
            // No Release ID - try text-based lookup to enrich metadata
            try {
              console.log(`[CSV Import] Enriching metadata for "${artist}" - "${title}" via text lookup...`);
              const apiUrl = getApiUrl('/api/identify-by-text');
              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ artist, title }),
              });

              if (response.ok) {
                const lookupData = await response.json();
                if (lookupData.success && lookupData.primaryMatch) {
                  const match = lookupData.primaryMatch;
                  // Use enriched data if available
                  // CRITICAL: Always use HQ cover art from API, never user photo
                  if (match.coverImageRemoteUrl && !coverImageRemoteUrl) {
                    coverImageRemoteUrl = match.coverImageRemoteUrl;
                  }
                  if (match.tracks && match.tracks.length > 0 && tracks.length === 0) {
                    tracks = match.tracks.map((t: any) => ({
                      title: t.title,
                      trackNumber: t.trackNumber || null,
                    }));
                  }
                  if (match.year && !year) {
                    year = match.year;
                  }
                  if (match.discogsId) {
                    discogsReleaseId = parseInt(match.discogsId, 10);
                  }
                  console.log(`[CSV Import] ✅ Enriched metadata: ${tracks.length} tracks, cover: ${!!coverImageRemoteUrl}`);
                }
              } else {
                console.warn(`[CSV Import] ⚠️  Text lookup failed: ${response.status}`);
              }
            } catch (lookupError) {
              console.warn(`[CSV Import] ⚠️  Error during text lookup:`, lookupError);
              // Continue with basic data
            }
          }

          // Add Discogs Release ID to notes if available
          if (discogsReleaseId) {
            notesParts.push(`Discogs Release ID: ${discogsReleaseId}`);
          }

          // CRITICAL: Use unified image selection logic
          // If metadata lookup returned a coverImageRemoteUrl, use it and ignore any CSV image paths
          const { prepareImageFields } = require('../utils/imageSelection');
          const imageFields = prepareImageFields(coverImageRemoteUrl, null); // CSV doesn't have local images
          
          const record = await createRecord({
            title,
            artist,
            year,
            notes: notesParts.length > 0 ? notesParts.join(' | ') : null,
            coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
            coverImageLocalUri: imageFields.coverImageLocalUri,
          });

          // Add tracks if we have them
          if (tracks.length > 0 && record.id) {
            for (const track of tracks) {
              try {
                await createTrack({
                  recordId: record.id,
                  title: track.title,
                  trackNumber: track.trackNumber || null,
                });
              } catch (trackError) {
                console.warn(`[CSV Import] Failed to create track:`, trackError);
              }
            }
          }

          imported += 1;
        } catch (error) {
          console.error('Failed to import record', error);
          skipped += 1;
        }
      }

      setImportedCount(imported);
      setSkippedCount(skipped);

      Alert.alert(
        'Import Complete',
        `Imported ${imported} records successfully. ${skipped} rows were skipped.`,
        [{ text: 'OK', onPress: () => navigation.navigate('LibraryHome') }]
      );
    } catch (error) {
      console.error('Import failed', error);
      Alert.alert('Error', 'Could not import CSV file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppScreen title="Import from CSV" subtitle="Import your collection from a CSV file (e.g., from Discogs).">
      <ScrollView>
        <AppCard>
          <AppText variant="body" style={{ marginBottom: spacing.md }}>
            Select a CSV file from your device. The first row should contain column headers.
          </AppText>
          <AppButton
            title="Select CSV File"
            onPress={handleSelectFile}
            disabled={importing}
          />
        </AppCard>

        {csvHeaders.length > 0 && (
          <AppCard style={{ marginTop: spacing.md }}>
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Map Columns
            </AppText>
            <AppText variant="caption" style={{ marginBottom: spacing.sm, color: colors.textSecondary }}>
              Required: Artist, Title
            </AppText>
            <AppText variant="caption" style={{ marginBottom: spacing.md, color: colors.textSecondary }}>
              Optional: Year, Notes, Barcode, Release ID (Discogs)
            </AppText>

            <View style={{ gap: spacing.sm }}>
              <View>
                <AppText variant="caption" style={{ marginBottom: 4 }}>
                  Artist *
                </AppText>
                <View style={styles.columnSelector}>
                  {csvHeaders.map((header) => (
                    <TouchableOpacity
                      key={header}
                      onPress={() => setMapping({ ...mapping, artist: header })}
                      style={[
                        styles.columnOption,
                        {
                          backgroundColor:
                            mapping.artist === header ? colors.accent : colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{
                          color:
                            mapping.artist === header ? colors.background : colors.textPrimary,
                        }}
                      >
                        {header}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <AppText variant="caption" style={{ marginBottom: 4 }}>
                  Title *
                </AppText>
                <View style={styles.columnSelector}>
                  {csvHeaders.map((header) => (
                    <TouchableOpacity
                      key={header}
                      onPress={() => setMapping({ ...mapping, title: header })}
                      style={[
                        styles.columnOption,
                        {
                          backgroundColor:
                            mapping.title === header ? colors.accent : colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{
                          color:
                            mapping.title === header ? colors.background : colors.textPrimary,
                        }}
                      >
                        {header}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <AppText variant="caption" style={{ marginBottom: 4 }}>
                  Year (optional)
                </AppText>
                <View style={styles.columnSelector}>
                  <TouchableOpacity
                    onPress={() => setMapping({ ...mapping, year: undefined })}
                    style={[
                      styles.columnOption,
                      {
                        backgroundColor: !mapping.year ? colors.accent : colors.surfaceAlt,
                        borderColor: colors.borderSubtle,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      style={{
                        color: !mapping.year ? colors.background : colors.textPrimary,
                      }}
                    >
                      None
                    </AppText>
                  </TouchableOpacity>
                  {csvHeaders.map((header) => (
                    <TouchableOpacity
                      key={header}
                      onPress={() => setMapping({ ...mapping, year: header })}
                      style={[
                        styles.columnOption,
                        {
                          backgroundColor:
                            mapping.year === header ? colors.accent : colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{
                          color:
                            mapping.year === header ? colors.background : colors.textPrimary,
                        }}
                      >
                        {header}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <AppText variant="caption" style={{ marginBottom: 4 }}>
                  Release ID (optional - Discogs)
                </AppText>
                <AppText variant="caption" style={{ marginBottom: 4, fontSize: 10, color: colors.textSecondary }}>
                  If provided, will fetch cover image, tracks, and correct year from Discogs
                </AppText>
                <View style={styles.columnSelector}>
                  <TouchableOpacity
                    onPress={() => setMapping({ ...mapping, releaseId: undefined })}
                    style={[
                      styles.columnOption,
                      {
                        backgroundColor: !mapping.releaseId ? colors.accent : colors.surfaceAlt,
                        borderColor: colors.borderSubtle,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      style={{
                        color: !mapping.releaseId ? colors.background : colors.textPrimary,
                      }}
                    >
                      None
                    </AppText>
                  </TouchableOpacity>
                  {csvHeaders.map((header) => (
                    <TouchableOpacity
                      key={header}
                      onPress={() => setMapping({ ...mapping, releaseId: header })}
                      style={[
                        styles.columnOption,
                        {
                          backgroundColor:
                            mapping.releaseId === header ? colors.accent : colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{
                          color:
                            mapping.releaseId === header ? colors.background : colors.textPrimary,
                        }}
                      >
                        {header}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <AppButton
              title="Import Records"
              onPress={handleImport}
              disabled={importing || !mapping.artist || !mapping.title}
              style={{ marginTop: spacing.md }}
            />

            {importing && (
              <View style={styles.importStatus}>
                <ActivityIndicator size="small" color={colors.accent} />
                <AppText variant="caption" style={{ marginLeft: spacing.sm }}>
                  Importing...
                </AppText>
              </View>
            )}
          </AppCard>
        )}
      </ScrollView>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  columnSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  columnOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  importStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
});

