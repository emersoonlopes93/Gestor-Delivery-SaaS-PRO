import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gestor.tenant',
  appName: 'PedeHub Lojista',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    LocalNotifications: {
      iconColor: '#22c55e',
      smallIcon: 'ic_stat_pedehub',
    },
  },
};

export default config;
