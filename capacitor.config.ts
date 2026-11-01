import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.recallmate.mobile',
  appName: 'RecallMate',
  webDir: 'out/mobile',
  backgroundColor: '#f7f8fa',
  android: { allowMixedContent: false },
  plugins: {
    SystemBars: { style: 'LIGHT', insetsHandling: 'css' },
  },
};
export default config;
