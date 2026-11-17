import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ecotrack.ciudadano',
  appName: 'EcoTrack',
  webDir: 'dist-android',
  server: { androidScheme: 'https', cleartext: false },
};
export default config;
