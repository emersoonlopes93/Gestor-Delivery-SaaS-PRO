export type ConnectivityState =
  | 'background_suspended'
  | 'foreground_online_connected'
  | 'foreground_online_reconnecting'
  | 'foreground_offline'
  | 'foreground_service_unavailable';

export type ConnectivityIssue = 'offline' | 'reconnecting' | 'service_unavailable';

export const CONNECTION_GRACE_PERIOD_MS = 5_000;
export const OFFLINE_DEBOUNCE_MS = 1_200;

export function resolveConnectivityState(input: {
  appActive: boolean;
  networkOnline: boolean;
  socketConnected: boolean;
  serviceReachable?: boolean;
}): ConnectivityState {
  if (!input.appActive) return 'background_suspended';
  if (!input.networkOnline) return 'foreground_offline';
  if (input.socketConnected) return 'foreground_online_connected';
  if (input.serviceReachable === false) return 'foreground_service_unavailable';
  return 'foreground_online_reconnecting';
}

export function connectionIssueCopy(issue: ConnectivityIssue) {
  if (issue === 'offline') {
    return {
      title: 'Sem conexao com a internet',
      message: 'Verifique a rede deste dispositivo. Novos pedidos podem atrasar.',
    };
  }

  if (issue === 'reconnecting') {
    return {
      title: 'Reconectando ao servidor...',
      message: 'A rede esta disponivel, mas o painel ainda esta restabelecendo o tempo real.',
    };
  }

  return {
    title: 'Reconectando ao servidor...',
    message: 'O servico esta temporariamente indisponivel. A reconexao continua em segundo plano.',
  };
}
