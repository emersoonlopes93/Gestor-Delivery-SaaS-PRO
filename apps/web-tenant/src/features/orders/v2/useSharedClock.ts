import { useEffect, useState } from 'react';

/** A single render clock for all card timers; it deliberately contains no SLA policy. */
export function useSharedClock(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
