export interface DriverSettlementPeriod {
  from: string;
  to: string;
}

export function driverSettlementPeriodSuffix(period: DriverSettlementPeriod): string {
  const params = new URLSearchParams();
  if (period.from) params.set('from', new Date(`${period.from}T00:00:00`).toISOString());
  if (period.to) params.set('to', new Date(`${period.to}T23:59:59.999`).toISOString());
  const query = params.toString();
  return query ? `&${query}` : '';
}
