import Constants from 'expo-constants';
import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';

import { printThermalInvoice } from '../services/thermalReceiptPrint';
import { getSavedThermalPrinter } from '../services/thermalPrinterStorage';

export function useThermalReceiptPrint() {
  return useCallback(async (receipt) => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Bluetooth thermal printing is not available in the web build.');
      return;
    }
    if (Constants.appOwnership === 'expo') {
      Alert.alert(
        'Install a native build',
        'Thermal printers need Bluetooth native code. Use an EAS preview/production APK (or a dev client), not Expo Go.'
      );
      return;
    }
    const saved = await getSavedThermalPrinter();
    if (!saved?.address) {
      Alert.alert(
        'No printer',
        'Open Profile, go to the Printer tab, scan for devices, and select your Bluetooth receipt printer.'
      );
      return;
    }
    try {
      await printThermalInvoice(receipt, saved);
    } catch (e) {
      const msg = e?.message ?? String(e);
      Alert.alert('Print failed', msg);
    }
  }, []);
}
