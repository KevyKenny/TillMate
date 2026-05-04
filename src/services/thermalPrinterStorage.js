import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@tillmate/thermal_printer_v1';

/**
 * @returns {Promise<{ address: string; name: string } | null>}
 */
export async function getSavedThermalPrinter() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.address === 'string') {
      return { address: parsed.address, name: typeof parsed.name === 'string' ? parsed.name : 'Printer' };
    }
    return null;
  } catch {
    return null;
  }
}

/** @param {{ address: string; name: string }} device */
export async function setSavedThermalPrinter(device) {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ address: device.address, name: device.name || 'Printer' })
  );
}

export async function clearSavedThermalPrinter() {
  await AsyncStorage.removeItem(KEY);
}
