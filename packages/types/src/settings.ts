export interface TenantSettingsDTO {
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  businessPhone?: string;
  businessEmail?: string;
  address?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  lat?: number;
  lng?: number;
  paymentMethods: string[];
  pixKey?: string;
  mercadoPagoAccessToken?: string;
  logoUrl?: string;
  whatsappNotificationsEnabled: boolean;
  notificationTemplates: Record<string, string>;
  audioNotificationEnabled: boolean;
  notificationVolume: number;
  newOrderSound: string;
  cancellationSound: string;
  handoffSound: string;
  readySound: string;
  browserNotificationsEnabled: boolean;
  isStorePaused: boolean;
  storePauseReason?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SystemConfigDTO {
  id: string;
  appName: string;
  defaultWhatsAppProvider: string;
  defaultAiProvider: string;
  maintenanceMode: boolean;
  updatedAt: Date | string;
}
