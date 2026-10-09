import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pedehub.driver',
  appName: 'PedeHub Entregador',
  webDir: 'dist',
  android: {
    adjustMarginsForEdgeToEdge: 'auto',
    useLegacyBridge: true,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#f97316',
      smallIcon: 'ic_stat_pedehub_driver',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
