import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.shalom.companion',
  appName: 'SHALOM',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
  android: {
    backgroundColor: '#070e20',
    allowMixedContent: false,
  },
};

export default config;
