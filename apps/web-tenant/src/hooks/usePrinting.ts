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
  stationId: string;
}

export interface CreateDevicePayload {
  stationId: string;
  name: string;
  connectionType: 'BLUETOOTH_SPP' | 'USB' | 'IP';
  address?: string;
  isDefault?: boolean;
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

export const useTestPrint = () => {
  return useMutation({
    mutationFn: async (payload: { stationSlug: string; deviceName: string }) => {
      const { data } = await api.post('/printing/test', payload);
      return data;
    },
  });
};
