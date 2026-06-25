import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { APP_NAME_STORAGE_KEY, DEFAULT_APP_NAME, getAppInitial, normalizeAppName } from '../lib/branding';

type PlatformBrandConfig = {
  appName?: string | null;
};

function readCachedAppName(): string {
  return normalizeAppName(localStorage.getItem(APP_NAME_STORAGE_KEY) || DEFAULT_APP_NAME);
}

export function usePlatformBrand() {
  const [appName, setAppName] = useState(readCachedAppName);

  useEffect(() => {
    document.title = `${appName} - SaaS Admin`;
  }, [appName]);

  useEffect(() => {
    if (!localStorage.getItem('admin_accessToken')) return;

    let active = true;
    api.get<PlatformBrandConfig>('/admin/integrations/config')
      .then((response) => {
        if (!active || !response.success) return;
        const nextName = normalizeAppName(response.data?.appName);
        localStorage.setItem(APP_NAME_STORAGE_KEY, nextName);
        setAppName(nextName);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return {
    appName,
    appInitial: getAppInitial(appName),
  };
}
