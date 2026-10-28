import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maxwellward.championsatlas',
  appName: "Champion's Atlas",
  webDir: 'build',
  ...(process.env.ATLAS_INSPECT_WEBVIEW === '1'
    ? { ios: { webContentsDebuggingEnabled: true } }
    : {}),
};

export default config;
