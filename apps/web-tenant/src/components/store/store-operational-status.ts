import type { TenantOperatingHours, TenantSettings } from '@gestor/types';

export type StoreOperationalStatus = 'open' | 'closed' | 'paused';

export interface ResolvedStoreOperationalStatus {
  status: StoreOperationalStatus;
  isWithinOperatingHours: boolean;
  canTogglePause: boolean;
  nextOpenTime: string | null;
}

interface LocalClock {
  dayOfWeek: number;
  minutes: number;
}

const dayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localClock(now: Date, timezone: string): LocalClock {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }

  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    dayOfWeek: dayMap[part('weekday')] ?? now.getDay(),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isActiveRule(
  rule: TenantOperatingHours,
  dayOfWeek: number,
  previousDay: number,
  currentMinutes: number,
) {
  if (!rule.isOpen || !rule.openTime || !rule.closeTime) return false;
  const open = timeToMinutes(rule.openTime);
  const close = timeToMinutes(rule.closeTime);
  if (close >= open) {
    return rule.dayOfWeek === dayOfWeek && currentMinutes >= open && currentMinutes <= close;
  }
  return (rule.dayOfWeek === dayOfWeek && currentMinutes >= open)
    || (rule.dayOfWeek === previousDay && currentMinutes <= close);
}

function findNextOpenTime(hours: TenantOperatingHours[], dayOfWeek: number, currentMinutes: number) {
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const candidateDay = (dayOfWeek + dayOffset) % 7;
    const candidates = hours
      .filter((rule) => rule.dayOfWeek === candidateDay && rule.isOpen && rule.openTime)
      .map((rule) => rule.openTime as string)
      .filter((time) => dayOffset > 0 || timeToMinutes(time) > currentMinutes)
      .sort((left, right) => timeToMinutes(left) - timeToMinutes(right));
    if (candidates[0]) return candidates[0];
  }
  return null;
}

export function resolveStoreOperationalStatus(
  settings: TenantSettings | null | undefined,
  operatingHours: TenantOperatingHours[],
  now = new Date(),
): ResolvedStoreOperationalStatus {
  const timezone = settings?.timezone || 'America/Sao_Paulo';
  const clock = localClock(now, timezone);
  const previousDay = (clock.dayOfWeek + 6) % 7;
  const isWithinOperatingHours = operatingHours.some((rule) => (
    isActiveRule(rule, clock.dayOfWeek, previousDay, clock.minutes)
  ));

  if (!isWithinOperatingHours) {
    return {
      status: 'closed',
      isWithinOperatingHours: false,
      canTogglePause: false,
      nextOpenTime: findNextOpenTime(operatingHours, clock.dayOfWeek, clock.minutes),
    };
  }

  return {
    status: settings?.isStorePaused ? 'paused' : 'open',
    isWithinOperatingHours: true,
    canTogglePause: true,
    nextOpenTime: null,
  };
}
