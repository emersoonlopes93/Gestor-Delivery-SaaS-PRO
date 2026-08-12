import type { DriverLocationPointDTO } from '@gestor/types';

const STORAGE_KEY = 'gestor.driver.location-buffer.v1';
const MAX_BUFFERED_POINTS = 500;

export function readLocationBuffer(storage: Storage = localStorage): DriverLocationPointDTO[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_BUFFERED_POINTS) as DriverLocationPointDTO[] : [];
  } catch {
    return [];
  }
}

export function enqueueLocationPoint(
  point: DriverLocationPointDTO,
  storage: Storage = localStorage,
): void {
  try {
    const withoutDuplicate = readLocationBuffer(storage)
      .filter((candidate) => candidate.eventKey !== point.eventKey);
    storage.setItem(STORAGE_KEY, JSON.stringify([...withoutDuplicate, point].slice(-MAX_BUFFERED_POINTS)));
  } catch {
    // The live socket path remains available when local storage is unavailable.
  }
}

export function acknowledgeLocationPoints(
  eventKeys: string[],
  storage: Storage = localStorage,
): void {
  if (eventKeys.length === 0) return;
  try {
    const acknowledged = new Set(eventKeys);
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(readLocationBuffer(storage).filter((point) => !acknowledged.has(point.eventKey))),
    );
  } catch {
    // A later replay remains safe because the server deduplicates by event key.
  }
}
