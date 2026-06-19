export const DEFAULT_APP_NAME = 'PedeHub';
export const APP_NAME_STORAGE_KEY = 'platform_app_name';

export function normalizeAppName(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : DEFAULT_APP_NAME;
}

export function getAppInitial(appName: string): string {
  return normalizeAppName(appName).charAt(0).toUpperCase();
}
