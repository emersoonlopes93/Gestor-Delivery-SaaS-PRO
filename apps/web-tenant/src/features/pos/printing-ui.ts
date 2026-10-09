import type { PrinterDevice } from '../../hooks/usePrinting';

export type PrinterUiStatus = 'Não configurada' | 'Configurada' | 'Disponível' | 'Requer atenção' | 'Impressão em andamento';

export function getPrinterUiStatus(device: PrinterDevice | null, runtime: 'idle' | 'available' | 'printing' | 'attention' = 'idle'): PrinterUiStatus {
  if (!device) return 'Não configurada';
  if (runtime === 'printing') return 'Impressão em andamento';
  if (runtime === 'attention') return 'Requer atenção';
  if (runtime === 'available') return 'Disponível';
  return 'Configurada';
}

export function humanizePrintingError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  const normalized = detail.toLowerCase();
  if (normalized.includes('permission') || normalized.includes('permiss')) {
    return 'Permissão necessária. Permita o acesso a dispositivos próximos e tente novamente.';
  }
  if (normalized.includes('bluetooth') && (normalized.includes('off') || normalized.includes('deslig'))) {
    return 'Bluetooth desligado. Ative o Bluetooth do celular e tente novamente.';
  }
  if (normalized.includes('paread') || normalized.includes('paired')) {
    return 'Nenhuma impressora pareada. Pareie a impressora nas configurações do Android e volte aqui.';
  }
  if (normalized.includes('qz') || normalized.includes('websocket') || normalized.includes('windows')) {
    return 'Serviço de impressão não encontrado. Abra o serviço de impressão no computador e tente novamente.';
  }
  return 'Impressora indisponível. Verifique se ela está ligada e próxima e tente novamente.';
}

export class SingleFlight {
  private active = false;

  isActive() {
    return this.active;
  }

  async run(operation: () => Promise<void>) {
    if (this.active) return false;
    this.active = true;
    try {
      await operation();
      return true;
    } finally {
      this.active = false;
    }
  }
}
