import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface PrintStation {
  id: string;
  name: string;
  slug: string;
  autoPrintEnabled: boolean;
}

export interface PrinterDevice {
  id: string;
  name: string;
  connectionType: string;
  address?: string;
  vendor?: string;
  model?: string;
  paperWidth?: number;
  isDefault?: boolean;
  stationId?: string | null;
  isPrimary?: boolean;
  role?: string;
  purpose?: string;
  autoPrintEnabled?: boolean;
  isActive?: boolean;
}

export interface CreateDevicePayload {
  stationId?: string | null;
  name: string;
  connectionType: 'BLUETOOTH_SPP' | 'QZ_TRAY' | 'USB' | 'IP' | 'bluetooth_spp_android' | 'usb_bridge_future' | 'network_bridge_future' | 'web_serial_future';
  address?: string;
  isDefault?: boolean;
  isPrimary?: boolean;
  role?: string;
  purpose?: string;
  autoPrintEnabled?: boolean;
}

export const usePrintingStations = () => {
  return useQuery<PrintStation[]>({
    queryKey: ['printing-stations'],
    queryFn: async () => {
      const { data } = await api.get<PrintStation[]>('/printing/stations');
      return data;
    },
  });
};

export const usePrinterDevices = () => {
  return useQuery<PrinterDevice[]>({
    queryKey: ['printing-devices'],
    queryFn: async () => {
      const { data } = await api.get<PrinterDevice[]>('/printing/devices');
      return data;
    },
  });
};

export const useCreateDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateDevicePayload) => {
      const { data } = await api.post<PrinterDevice>('/printing/devices', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printing-devices'] });
    },
  });
};

export const useUpdateDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CreateDevicePayload & PrinterDevice> }) => {
      const { data } = await api.post<PrinterDevice>(`/printing/devices/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printing-devices'] });
    },
  });
};

export const useTestPrint = () => {
  return useMutation({
    mutationFn: async (payload: { stationSlug: string; deviceName: string }) => {
      const { data } = await api.post('/printing/test', payload);
      return data;
    },
  });
};
