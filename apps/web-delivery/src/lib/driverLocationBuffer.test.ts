import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeLocationPoints,
  enqueueLocationPoint,
  readLocationBuffer,
} from './driverLocationBuffer';

describe('driver location offline buffer', () => {
  beforeEach(() => localStorage.clear());

  it('keeps points in chronological insertion order and deduplicates event keys', () => {
    const first = {
      eventKey: 'point-a', recordedAt: '2026-08-12T12:00:00.000Z',
      lat: -23.5, lng: -46.6, source: 'foreground' as const,
    };
    enqueueLocationPoint(first);
    enqueueLocationPoint({ ...first, lat: -23.51 });
    enqueueLocationPoint({ ...first, eventKey: 'point-b', recordedAt: '2026-08-12T12:00:10.000Z' });
    expect(readLocationBuffer().map((point) => point.eventKey)).toEqual(['point-a', 'point-b']);
  });

  it('removes only points acknowledged by the API', () => {
    const base = {
      recordedAt: '2026-08-12T12:00:00.000Z',
      lat: -23.5, lng: -46.6, source: 'foreground' as const,
    };
    enqueueLocationPoint({ ...base, eventKey: 'point-a' });
    enqueueLocationPoint({ ...base, eventKey: 'point-b' });
    acknowledgeLocationPoints(['point-a']);
    expect(readLocationBuffer().map((point) => point.eventKey)).toEqual(['point-b']);
  });

  it('bounds background samples to the latest 500 points in FIFO order', () => {
    for (let index = 0; index < 505; index += 1) {
      enqueueLocationPoint({
        eventKey: `background-${index}`,
        recordedAt: new Date(1_723_000_000_000 + index * 1_000).toISOString(),
        lat: -23.5,
        lng: -46.6,
        source: 'background',
      });
    }
    const points = readLocationBuffer();
    expect(points).toHaveLength(500);
    expect(points[0]?.eventKey).toBe('background-5');
    expect(points.at(-1)?.eventKey).toBe('background-504');
  });
});
