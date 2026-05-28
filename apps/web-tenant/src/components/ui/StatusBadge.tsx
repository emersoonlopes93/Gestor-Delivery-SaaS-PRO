import { HTMLAttributes } from 'react';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

const baseClasses = 'inline-flex items-center font-medium rounded-full';

const statusClasses = {
  success: 'bg-status-success/10 text-status-success border border-status-success/20',
  warning: 'bg-status-warning/10 text-status-warning border border-status-warning/20',
  error: 'bg-destructive/10 text-destructive border border-destructive/20',
  info: 'bg-primary/10 text-primary border border-primary/20',
  neutral: 'bg-muted text-muted-foreground border border-border',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-[10px] uppercase tracking-wider',
  md: 'px-2.5 py-0.5 text-xs',
};

export const StatusBadge = ({ 
  status, 
  size = 'md', 
  className = '', 
  children,
  ...props 
}: StatusBadgeProps) => {
  return (
    <span className={`${baseClasses} ${statusClasses[status]} ${sizeClasses[size]} ${className}`} {...props}>
      {children}
    </span>
  );
};
