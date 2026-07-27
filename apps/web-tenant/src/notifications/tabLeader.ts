import { traceNotificationE2E } from './e2eTrace';

/**
 * tabLeader.ts
 *
 * Elege uma aba líder por tenant para reprodução de som e browser notifications.
 * Evita que múltiplas abas do mesmo tenant toquem o mesmo som simultaneamente.
 *
 * Estratégia (em ordem de preferência):
 * 1. Web Locks API (sem split-brain por design — o lock é exclusivo)
 * 2. Fallback: localStorage lease com ownerId + heartbeat + tie-break
 *
 * BroadcastChannel é usado para coordenação entre abas (evitar repetição
 * pós-troca de liderança). Fechado corretamente no cleanup.
 *
 * Uso:
 *   const leader = createTabLeader(tenantId);
 *   leader.isLeader()          // boolean — aba atual é líder?
 *   leader.markEventPlayed(id) // informa outras abas que o evento foi tocado
 *   leader.wasEventPlayed(id)  // verifica se outra aba já tocou o evento
 *   leader.destroy()           // cleanup obrigatório no unmount
 */

const LOCK_PREFIX = 'tenant-audio-leader';
const CHANNEL_PREFIX = 'tenant-audio-channel';
const LS_LEASE_PREFIX = 'tenant-audio-lease';

const HEARTBEAT_MS = 2_000;
const LEASE_TTL_MS = 6_000;
const PLAYED_TTL_MS = 30_000;

interface Lease {
  ownerId: string;
  expiresAt: number;
}

interface ChannelMessage {
  type: 'leader-alive' | 'event-played';
  ownerId: string;
  eventId?: string;
}

export interface TabLeader {
  isLeader(): boolean;
  markEventPlayed(eventId: string): void;
  wasEventPlayed(eventId: string): boolean;
  destroy(): void;
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Estratégia 1: Web Locks API
// ---------------------------------------------------------------------------

function createWebLocksLeader(tenantId: string): TabLeader | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return null;

  const lockName = `${LOCK_PREFIX}:${tenantId}`;
  const channelName = `${CHANNEL_PREFIX}:${tenantId}`;
  const ownerId = randomId();

  let leaderState = false;
  let abortController: AbortController | null = null;
  let channel: BroadcastChannel | null = null;
  const playedEvents = new Map<string, number>();

  // BroadcastChannel para coordenação (eventos tocados por outras abas)
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (ev: MessageEvent<ChannelMessage>) => {
      if (ev.data.type === 'event-played' && ev.data.eventId) {
        playedEvents.set(ev.data.eventId, Date.now());
      }
    };
  } catch {
    // BroadcastChannel não disponível — apenas lock funciona
  }

  function prunePlayed(now = Date.now()) {
    for (const [id, ts] of playedEvents) {
      if (now - ts > PLAYED_TTL_MS) playedEvents.delete(id);
    }
  }

  // Tenta adquirir lock exclusivo sem esperar (ifAvailable: true)
  function tryAcquire() {
    abortController = new AbortController();
    navigator.locks
      .request(
        lockName,
        { mode: 'exclusive', ifAvailable: true, signal: abortController.signal },
        (lock) => {
          if (!lock) {
            // Lock ocupado por outra aba — não é líder
            leaderState = false;
            traceNotificationE2E({ stage: 'leader.ready', tenantId, tabId: ownerId, lockStrategy: 'web-locks', isLeader: false, reason: 'lock-unavailable' });
            return Promise.resolve();
          }
          // É líder enquanto a Promise não resolver
          leaderState = true;
          traceNotificationE2E({ stage: 'leader.ready', tenantId, tabId: ownerId, lockStrategy: 'web-locks', isLeader: true, reason: 'lock-acquired' });
          // Promise que nunca resolve mantém o lock ativo até destroy()
          return new Promise<void>((resolve) => {
            // guardamos resolve para chamar no destroy()
            abortController!.signal.addEventListener('abort', () => {
              leaderState = false;
              resolve();
            });
          });
        },
      )
      .catch(() => {
        leaderState = false;
        traceNotificationE2E({ stage: 'leader.ready', tenantId, tabId: ownerId, lockStrategy: 'web-locks', isLeader: false, reason: 'lock-error' });
      });
  }

  tryAcquire();

  return {
    isLeader: () => leaderState,

    markEventPlayed(eventId: string) {
      playedEvents.set(eventId, Date.now());
      try {
        channel?.postMessage({ type: 'event-played', ownerId, eventId } satisfies ChannelMessage);
      } catch { /* ignore */ }
    },

    wasEventPlayed(eventId: string): boolean {
      prunePlayed();
      return playedEvents.has(eventId);
    },

    destroy() {
      leaderState = false;
      try { abortController?.abort(); } catch { /* ignore */ }
      try { channel?.close(); } catch { /* ignore */ }
      playedEvents.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Estratégia 2: Fallback localStorage lease
// ---------------------------------------------------------------------------

function createLocalStorageLeader(tenantId: string): TabLeader {
  const lsKey = `${LS_LEASE_PREFIX}:${tenantId}`;
  const channelName = `${CHANNEL_PREFIX}:${tenantId}`;
  const ownerId = randomId();

  let leaderState = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let channel: BroadcastChannel | null = null;
  const playedEvents = new Map<string, number>();

  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (ev: MessageEvent<ChannelMessage>) => {
      if (ev.data.type === 'event-played' && ev.data.eventId) {
        playedEvents.set(ev.data.eventId, Date.now());
      }
    };
  } catch { /* ignore */ }

  function readLease(): Lease | null {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return null;
      return JSON.parse(raw) as Lease;
    } catch { return null; }
  }

  function writeLease(lease: Lease) {
    try { localStorage.setItem(lsKey, JSON.stringify(lease)); } catch { /* ignore */ }
  }

  function clearLease() {
    try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
  }

  function tryElect(now = Date.now()): boolean {
    const existing = readLease();
    // Se não há lease ou lease expirada, tomar liderança
    if (!existing || now > existing.expiresAt) {
      writeLease({ ownerId, expiresAt: now + LEASE_TTL_MS });
      return true;
    }
    // Lease ativa de outro ownerId
    if (existing.ownerId === ownerId) {
      // Renovar própria lease
      writeLease({ ownerId, expiresAt: now + LEASE_TTL_MS });
      return true;
    }
    // Tie-break determinístico: ownerId com string < vence (ambos chegaram juntos)
    if (now > existing.expiresAt - HEARTBEAT_MS && ownerId < existing.ownerId) {
      writeLease({ ownerId, expiresAt: now + LEASE_TTL_MS });
      return true;
    }
    return false;
  }

  function prunePlayed(now = Date.now()) {
    for (const [id, ts] of playedEvents) {
      if (now - ts > PLAYED_TTL_MS) playedEvents.delete(id);
    }
  }

  // Eleição inicial
  leaderState = tryElect();
  traceNotificationE2E({ stage: 'leader.ready', tenantId, tabId: ownerId, lockStrategy: 'local-storage', isLeader: leaderState, reason: leaderState ? 'lease-acquired' : 'lease-held' });

  // Heartbeat: renovar lease a cada HEARTBEAT_MS
  heartbeatTimer = setInterval(() => {
    leaderState = tryElect();
  }, HEARTBEAT_MS);

  return {
    isLeader: () => leaderState,

    markEventPlayed(eventId: string) {
      playedEvents.set(eventId, Date.now());
      try {
        channel?.postMessage({ type: 'event-played', ownerId, eventId } satisfies ChannelMessage);
      } catch { /* ignore */ }
    },

    wasEventPlayed(eventId: string): boolean {
      prunePlayed();
      return playedEvents.has(eventId);
    },

    destroy() {
      leaderState = false;
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      // Limpar lease apenas se for própria (não roubar liderança de outra aba no cleanup)
      const existing = readLease();
      if (existing?.ownerId === ownerId) clearLease();
      try { channel?.close(); } catch { /* ignore */ }
      playedEvents.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Factory pública
// ---------------------------------------------------------------------------

/**
 * Cria um TabLeader para o tenant especificado.
 * Usa Web Locks API quando disponível; fallback para localStorage.
 * Sempre chamar `destroy()` no cleanup do componente/hook.
 */
export function createTabLeader(tenantId: string): TabLeader {
  return createWebLocksLeader(tenantId) ?? createLocalStorageLeader(tenantId);
}
