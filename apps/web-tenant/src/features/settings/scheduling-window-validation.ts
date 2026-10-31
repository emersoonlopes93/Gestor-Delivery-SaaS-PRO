export function isSupportedSchedulingWindow(startTime: string, endTime: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)
    && endTime > startTime;
}
