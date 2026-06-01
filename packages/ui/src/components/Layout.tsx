import { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8', className)}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
            <Icon size={28} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {Icon && (
        <div className="p-4 bg-muted rounded-full text-muted-foreground mb-4">
          <Icon size={32} />
        </div>
      )}
      <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
      {description && <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">{description}</p>}
      {action}
    </div>
  );
}

interface FormFieldProps {
  label?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label className="text-sm font-semibold text-foreground ml-1">{label}</label>}
      {children}
      {error && <p className="text-xs font-medium text-destructive ml-1">{error}</p>}
    </div>
  );
}
