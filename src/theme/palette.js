/** @param {'light' | 'dark'} scheme */
export function getPalette(scheme) {
  if (scheme === 'dark') {
    return {
      scheme: 'dark',
      background: '#0c0f12',
      surface: '#151a20',
      surfaceElevated: '#1c232c',
      text: '#f2f4f7',
      textMuted: '#9aa3ad',
      border: '#2a3441',
      borderLight: '#3d4a5c',
      primary: '#3d9fd6',
      primaryMuted: '#256892',
      onPrimary: '#ffffff',
      danger: '#e57373',
      tabBar: '#12161c',
      tabInactive: '#7a8696',
      inputBg: '#1c232c',
      receiptPaper: '#f7f8fa',
      receiptInk: '#111318',
    };
  }
  return {
    scheme: 'light',
    background: '#f4f6f8',
    surface: '#ffffff',
    surfaceElevated: '#f0f3f7',
    text: '#11181C',
    textMuted: '#687076',
    border: '#e1e6eb',
    borderLight: '#eef1f4',
    primary: '#0a7ea4',
    primaryMuted: '#086a8a',
    onPrimary: '#ffffff',
    danger: '#c0392b',
    tabBar: '#ffffff',
    tabInactive: '#687076',
    inputBg: '#f4f6f8',
    receiptPaper: '#ffffff',
    receiptInk: '#111318',
  };
}
