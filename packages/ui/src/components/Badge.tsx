import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
      secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
      outline: 'text-foreground border border-border',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, status, ...props }, ref) => {
    const statuses = {
      success: 'bg-status-success/10 text-status-success border-status-success/20',
      warning: 'bg-status-warning/10 text-status-warning border-status-warning/20',
      error: 'bg-destructive/10 text-destructive border-destructive/20',
      info: 'bg-primary/10 text-primary border-primary/20',
      neutral: 'bg-muted text-muted-foreground border-border',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
          statuses[status],
          className
        )}
        {...props}
      />
    );
  }
);

StatusBadge.displayName = 'StatusBadge';
