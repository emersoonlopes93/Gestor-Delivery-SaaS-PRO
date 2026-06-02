import { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  size?: 'sm' | 'md';
}

const baseClasses = 'inline-flex items-center font-medium rounded-full';

const variantClasses = {
  default: 'bg-primary/20 text-primary border border-primary/30',
  success: 'bg-status-success/20 text-status-success border border-status-success/30',
  warning: 'bg-status-warning/20 text-status-warning border border-status-warning/30',
  destructive: 'bg-destructive/20 text-destructive border border-destructive/30',
  info: 'bg-muted text-muted-foreground border border-border',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-[10px] uppercase tracking-wider',
  md: 'px-2.5 py-0.5 text-xs',
};

export const Badge = ({ 
  variant = 'default', 
  size = 'md', 
  className = '', 
  children,
  ...props 
}: BadgeProps) => {
  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>
      {children}
    </div>
  );
};
