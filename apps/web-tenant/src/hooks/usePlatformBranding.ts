import { useQuery } from '@tanstack/react-query';
import type { PlatformBrandingDTO } from '@gestor/types';
import { api } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

export function usePlatformBranding() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['platform-branding'],
    queryFn: async () => {
      const response = await api.get<PlatformBrandingDTO>('/tenant/platform-branding');
      return response.data;
    },
    enabled: Boolean(user?.tenantId),
    staleTime: 1000 * 60 * 5,
  });
}

