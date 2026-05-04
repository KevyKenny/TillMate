import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  clearSavedThermalPrinter,
  getSavedThermalPrinter,
  setSavedThermalPrinter,
} from '../services/thermalPrinterStorage';

function mergeDevices(paired, found) {
  const map = new Map();
  for (const d of paired || []) map.set(d.address, d);
  for (const d of found || []) {
    if (!map.has(d.address)) map.set(d.address, d);
  }
  return [...map.values()];
}

/** @param {{ colors: Record<string, string> }} props */
export default function ThermalPrinterSection({ colors }) {
  const [saved, setSaved] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);

  const loadSaved = useCallback(async () => {
    setSaved(await getSavedThermalPrinter());
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const runScan = async () => {
    setScanning(true);
    setDevices([]);
    try {
      const { default: ThermalPrinter } = await import('react-native-thermal-printer-driver');
      const { paired, found } = await ThermalPrinter.scan();
      const list = mergeDevices(paired, found);
      setDevices(list);
      if (!list.length) {
        Alert.alert(
          'No printers found',
          Platform.OS === 'ios'
            ? 'This phone only sees Bluetooth Low Energy printers. Many pocket printers use Bluetooth Classic and only work on Android.'
            : 'Turn the printer on, enable Bluetooth, and pair it in system settings if it still does not appear.'
        );
      }
    } catch (e) {
      Alert.alert('Scan failed', e?.message ?? String(e));
    } finally {
      setScanning(false);
    }
  };

  const onOpenPicker = async () => {
    Alert.alert('Thermal printer', 'Coming soon...');
  };

  const onPickDevice = async (device) => {
    try {
      await setSavedThermalPrinter({ address: device.address, name: device.name });
      setSaved({ address: device.address, name: device.name });
      setPickerOpen(false);
      Alert.alert('Printer saved', `${device.name || 'Device'} will be used when you tap Print on a receipt.`);
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? String(e));
    }
  };

  const onClear = async () => {
    await clearSavedThermalPrinter();
    setSaved(null);
    Alert.alert('Cleared', 'Receipt printing will ask you to pick a printer again.');
  };

  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>Bluetooth receipt printer</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Pair your 58mm ESC/POS printer in Android Bluetooth settings if needed, then scan here and select it.
        {/* Rebuild the app after this feature was added (EAS preview APK), not Expo Go. */}
      </Text>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
        <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Active printer</Text>
        <Text style={[styles.cardValue, { color: colors.text }]}>
          {saved ? `${saved.name}\n${saved.address}` : 'None selected'}
        </Text>
      </View>

      <Pressable
        onPress={onOpenPicker}
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="bluetooth" size={18} color={colors.onPrimary} />
        <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Scan & choose printer</Text>
      </Pressable>

      {saved ? (
        <Pressable onPress={onClear} style={[styles.secondaryBtn, { borderColor: colors.border }]}>
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Forget printer</Text>
        </Pressable>
      ) : null}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Nearby printers</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>Close</Text>
              </Pressable>
            </View>
            {scanning ? (
              <View style={styles.centerPad}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.textMuted, marginTop: 12 }}>Scanning…</Text>
              </View>
            ) : (
              <FlatList
                data={devices}
                keyExtractor={(item) => item.address}
                contentContainerStyle={styles.listPad}
                ListEmptyComponent={
                  <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20 }}>No devices this scan.</Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => onPickDevice(item)}
                    style={({ pressed }) => [
                      styles.deviceRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.inputBg,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <Ionicons name="print-outline" size={22} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                        {item.name || 'Unknown device'}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        {item.address} · {item.deviceType}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              />
            )}
            <Pressable
              onPress={runScan}
              disabled={scanning}
              style={[styles.rescan, { opacity: scanning ? 0.5 : 1 }]}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>Scan again</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, padding: 14 },
  title: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  hint: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 14 },
  cardLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  cardValue: { fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    marginTop: 16,
    borderRadius: 12,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    minHeight: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '900' },
  centerPad: { paddingVertical: 40, alignItems: 'center' },
  listPad: { paddingHorizontal: 14, paddingBottom: 8 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  rescan: { alignItems: 'center', paddingVertical: 12 },
});
