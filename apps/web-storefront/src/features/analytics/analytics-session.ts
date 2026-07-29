import { z } from 'zod';

const SESSION_PREFIX = 'gestor:analytics-session:v1';
const SESSION_TTL_MS = 30 * 60 * 1000;
const SessionSchema = z.object({ sessionId: z.string().min(16), lastActivityAt: z.number().finite() }).strict();

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memorySessions = new Map<string, { sessionId: string; lastActivityAt: number }>();

function keyFor(tenantKey: string) {
  return `${SESSION_PREFIX}:${encodeURIComponent(tenantKey)}`;
}

function storage(): SessionStorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through to the in-memory-safe fallback */ }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export function getAnalyticsSessionId(
  tenantKey: string,
  now = Date.now(),
  sessionStorage: SessionStorageLike | null = storage(),
): string {
  const key = keyFor(tenantKey);
  let previous = memorySessions.get(key);
  if (sessionStorage) {
    try {
      const parsed = SessionSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
      if (parsed.success) {
        previous = {
          sessionId: parsed.data.sessionId,
          lastActivityAt: parsed.data.lastActivityAt,
        };
      }
    } catch { /* storage can be unavailable or malformed */ }
  }

  const current = previous && now - previous.lastActivityAt < SESSION_TTL_MS
    ? previous
    : { sessionId: newId(), lastActivityAt: now };
  current.lastActivityAt = now;
  memorySessions.set(key, current);
  if (sessionStorage) {
    try { sessionStorage.setItem(key, JSON.stringify(current)); } catch { /* keep memory-only session */ }
  }
  return current.sessionId;
}

export function clearAnalyticsSession(
  tenantKey: string,
  sessionStorage: SessionStorageLike | null = storage(),
) {
  const key = keyFor(tenantKey);
  memorySessions.delete(key);
  try { sessionStorage?.removeItem(key); } catch { /* best effort */ }
}

export const analyticsSessionConstants = { SESSION_PREFIX, SESSION_TTL_MS };
