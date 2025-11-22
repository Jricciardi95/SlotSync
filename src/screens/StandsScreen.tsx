import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import { createRow, getRowUnitCounts, getRows, updateRow, deleteRow } from '../data/repository';
import { Row } from '../data/types';
import { StandsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<StandsStackParamList, 'RowsHome'>;

export const StandsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [unitCounts, setUnitCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [rowName, setRowName] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [editRowName, setEditRowName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rowList, counts] = await Promise.all([getRows(), getRowUnitCounts()]);
      setRows(rowList);
      setUnitCounts(counts);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleCreateRow = async () => {
    if (!rowName.trim()) {
      Alert.alert('Stand name required', 'Please enter a name for the stand.');
      return;
    }

    try {
      const newRow = await createRow(rowName.trim());
      setRowName('');
      setModalVisible(false);
      setRows((prev) => [newRow, ...prev]);
      setUnitCounts((prev) => ({ ...prev, [newRow.id]: 0 }));
    } catch (error) {
      Alert.alert('Error creating stand', 'Please try again.');
      console.log(error);
    }
  };

  const handleEditRow = (row: Row) => {
    setEditingRow(row);
    setEditRowName(row.name);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRow || !editRowName.trim()) {
      Alert.alert('Stand name required', 'Please enter a name for the stand.');
      return;
    }

    try {
      await updateRow(editingRow.id, editRowName.trim());
      setRows((prev) =>
        prev.map((r) =>
          r.id === editingRow.id ? { ...r, name: editRowName.trim() } : r
        )
      );
      setEditModalVisible(false);
      setEditingRow(null);
      setEditRowName('');
    } catch (error) {
      Alert.alert('Error updating stand', 'Please try again.');
      console.log(error);
    }
  };

  const handleDeleteRow = (row: Row) => {
    Alert.alert(
      'Delete Stand',
      `Are you sure you want to delete "${row.name}"? This will also delete all units and slot configurations in this stand.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRow(row.id);
              setRows((prev) => prev.filter((r) => r.id !== row.id));
              setUnitCounts((prev) => {
                const updated = { ...prev };
                delete updated[row.id];
                return updated;
              });
            } catch (error) {
              Alert.alert('Error deleting stand', 'Please try again.');
              console.log(error);
            }
          },
        },
      ]
    );
  };

  const content = (
    <AppScreen
      title="Stands"
      subtitle="Manage your shelf rows and connected units."
    >
      {loading && rows.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <AppText variant="caption" style={{ marginTop: 8 }}>
            Loading stands…
          </AppText>
        </View>
      ) : (
        rows.map((row) => (
          <AppCard key={row.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="subtitle" style={{ flex: 1 }}>{row.name}</AppText>
              <AppIconButton
                name="create-outline"
                onPress={() => handleEditRow(row)}
              />
            </View>
            <AppText variant="caption" style={{ marginVertical: 12 }}>
              {unitCounts[row.id] ?? 0} unit
              {(unitCounts[row.id] ?? 0) === 1 ? '' : 's'} configured
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <AppButton
                title="Open Stand"
                onPress={() =>
                  navigation.navigate('RowDetail', {
                    rowId: row.id,
                    rowName: row.name,
                  })
                }
                style={{ flex: 1 }}
              />
              <AppIconButton
                name="trash-outline"
                onPress={() => handleDeleteRow(row)}
              />
            </View>
          </AppCard>
        ))
      )}

      {rows.length === 0 && !loading && (
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
            No stands yet
          </AppText>
          <AppText variant="body">
            Tap the cyan + button to add your first stand. Each stand maps to a
            physical row of SlotSync units.
          </AppText>
        </AppCard>
      )}
    </AppScreen>
  );

  return (
    <>
      {content}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setModalVisible(true)}
        style={[
          styles.fab,
          {
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
          },
        ]}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
                borderRadius: radius.lg,
              },
            ]}
          >
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Create Stand
            </AppText>
            <TextInput
              placeholder="Stand name"
              placeholderTextColor={colors.textMuted}
              value={rowName}
              onChangeText={setRowName}
              style={[
                styles.input,
                {
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <AppButton
                title="Cancel"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => {
                  setModalVisible(false);
                  setRowName('');
                }}
              />
              <AppButton
                title="Save"
                style={{ flex: 1 }}
                onPress={handleCreateRow}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
                borderRadius: radius.lg,
              },
            ]}
          >
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Edit Stand
            </AppText>
            <TextInput
              placeholder="Stand name"
              placeholderTextColor={colors.textMuted}
              value={editRowName}
              onChangeText={setEditRowName}
              style={[
                styles.input,
                {
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <AppButton
                title="Cancel"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => {
                  setEditModalVisible(false);
                  setEditingRow(null);
                  setEditRowName('');
                }}
              />
              <AppButton
                title="Save"
                style={{ flex: 1 }}
                onPress={handleSaveEdit}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    zIndex: 999,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
});
