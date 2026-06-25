import { statusBadgeClass, TabId, TABS, statusLabels } from '../types';

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${statusBadgeClass(status)}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

