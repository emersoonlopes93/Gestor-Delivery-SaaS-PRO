import type { CSSProperties } from 'react';

export const chartGridColor = 'var(--border)';
export const chartAxisColor = 'var(--muted-foreground)';

export const chartTooltipContentStyle: CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  boxShadow: 'var(--shadow-dropdown)',
  color: 'var(--popover-foreground)',
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--popover-foreground)',
  fontWeight: 700,
};

export const chartTooltipItemStyle: CSSProperties = {
  color: 'var(--popover-foreground)',
};

export const chartTooltipCursor = {
  fill: 'var(--muted)',
  fillOpacity: 0.55,
};
