import type { OptionItem } from '@gestor/types';

export function splitOptionGroupItems(items?: OptionItem[]) {
  const sorted = [...(items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    activeItems: sorted.filter((item) => !item.deletedAt),
    archivedItems: sorted.filter((item) => Boolean(item.deletedAt)),
  };
}
