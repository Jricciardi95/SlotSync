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
import { LibraryStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system/legacy';
import { importCsvRowsWithEnrichment, CsvRow } from '../utils/csvImport';

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
        } else if (lower.includes('release id') || lower === 'release id' || lower === 'releaseid') {
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
    console.log(`[CSV Import] ========================================`);
    console.log(`[CSV Import] 🎬 handleImport() CALLED`);
    console.log(`[CSV Import] 📋 Current mapping:`, mapping);
    
    if (!mapping.artist || !mapping.title) {
      console.error(`[CSV Import] ❌ Missing mapping: artist="${mapping.artist}", title="${mapping.title}"`);
      Alert.alert('Missing mapping', 'Artist and Title columns are required.');
      return;
    }

    console.log(`[CSV Import] ✅ Mapping valid, starting import...`);
    setImporting(true);
    setImportedCount(0);
    setSkippedCount(0);

    try {
      console.log(`[CSV Import] 📂 Opening document picker...`);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      console.log(`[CSV Import] 📂 Document picker result:`, { canceled: result.canceled, hasAssets: !!result.assets?.[0] });

      if (result.canceled || !result.assets?.[0]) {
        console.log(`[CSV Import] ⏭️  User canceled or no file selected`);
        setImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      console.log(`[CSV Import] 📄 Reading file from: ${fileUri}`);
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      console.log(`[CSV Import] 📄 File content length: ${fileContent.length} characters`);
      
      const lines = parseCSV(fileContent);
      console.log(`[CSV Import] 📊 Parsed ${lines.length} lines from CSV`);

      if (lines.length < 2) {
        Alert.alert('Error', 'CSV file has no data rows.');
        setImporting(false);
        return;
      }

      const headers = lines[0];
      const dataRows = lines.slice(1);

      console.log(`[CSV Import] ========================================`);
      console.log(`[CSV Import] 🚀 STARTING CSV IMPORT`);
      console.log(`[CSV Import] 📊 Total rows to process: ${dataRows.length}`);
      console.log(`[CSV Import] 📋 Headers:`, headers);
      console.log(`[CSV Import] ========================================`);

      const artistIdx = headers.indexOf(mapping.artist);
      const titleIdx = headers.indexOf(mapping.title);
      const yearIdx = mapping.year ? headers.indexOf(mapping.year) : -1;
      const notesIdx = mapping.notes ? headers.indexOf(mapping.notes) : -1;
      const barcodeIdx = mapping.barcode ? headers.indexOf(mapping.barcode) : -1;
      const releaseIdIdx = mapping.releaseId ? headers.indexOf(mapping.releaseId) : -1;

      console.log(`[CSV Import] 📍 Column indices: artist=${artistIdx}, title=${titleIdx}, year=${yearIdx}, releaseId=${releaseIdIdx}`);

      // Parse rows into CsvRow format
      const csvRows: CsvRow[] = [];
      for (const row of dataRows) {
        if (row.length <= Math.max(artistIdx, titleIdx)) {
          continue; // Skip invalid rows
        }

        const artist = row[artistIdx]?.trim() || '';
        const title = row[titleIdx]?.trim() || '';

        if (!artist || !title) {
          continue; // Skip rows without artist/title
        }

        // Parse year from CSV - be strict about validation
        let year: number | null = null;
        if (yearIdx >= 0 && row[yearIdx]) {
          const yearStr = row[yearIdx].trim();
          const parsedYear = parseInt(yearStr, 10);
          const currentYear = new Date().getFullYear();
          if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= currentYear + 1 && parsedYear !== 2025) {
            year = parsedYear;
          }
        }

        // Parse notes
        const notesParts: string[] = [];
        if (notesIdx >= 0 && row[notesIdx]) {
          notesParts.push(row[notesIdx].trim());
        }
        if (barcodeIdx >= 0 && row[barcodeIdx]) {
          notesParts.push(`Barcode: ${row[barcodeIdx].trim()}`);
        }
        const notes = notesParts.length > 0 ? notesParts.join(' | ') : null;

        // Parse release ID
        let releaseId: number | null = null;
        if (releaseIdIdx >= 0 && row[releaseIdIdx]) {
          const releaseIdStr = row[releaseIdIdx]?.trim();
          const parsedReleaseId = parseInt(releaseIdStr, 10);
          if (parsedReleaseId && !isNaN(parsedReleaseId) && parsedReleaseId > 0) {
            releaseId = parsedReleaseId;
          }
        }

        csvRows.push({
          artist,
          title,
          year,
          notes,
          releaseId,
        });
      }

      // Import rows with concurrency and retry
      const importResult = await importCsvRowsWithEnrichment(csvRows, {
        concurrency: 4,
        maxRetries: 2,
        onProgress: (current, total) => {
          setImportedCount(current);
          setSkippedCount(total - current);
        },
      });

      const imported = importResult.imported;
      const skipped = importResult.skipped;

      // Log failures for debugging
      if (importResult.failures.length > 0) {
        console.warn(`[CSV Import] ⚠️  ${importResult.failures.length} rows failed:`);
        for (const failure of importResult.failures) {
          console.warn(`[CSV Import]   - Row ${failure.rowIndex + 1}: "${failure.artist}" - "${failure.title}": ${failure.error}`);
        }
      }


      setImportedCount(imported);
      setSkippedCount(skipped);

      console.log(`[CSV Import] ========================================`);
      console.log(`[CSV Import] ✅ IMPORT COMPLETE: ${imported} imported, ${skipped} skipped`);
      console.log(`[CSV Import] ========================================`);
      
      Alert.alert(
        'Import Complete',
        `Imported ${imported} records successfully. ${skipped} rows were skipped.`,
        [{ text: 'OK', onPress: () => navigation.navigate('LibraryHome') }]
      );
    } catch (error: any) {
      console.error(`[CSV Import] ========================================`);
      console.error(`[CSV Import] ❌ IMPORT FAILED:`, error);
      console.error(`[CSV Import] ❌ Error type: ${error?.name}`);
      console.error(`[CSV Import] ❌ Error message: ${error?.message}`);
      console.error(`[CSV Import] ❌ Error stack:`, error?.stack?.substring(0, 500));
      console.error(`[CSV Import] ========================================`);
      Alert.alert('Error', `Could not import CSV file: ${error?.message || 'Unknown error'}`);
    } finally {
      console.log(`[CSV Import] 🏁 Setting importing=false`);
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

