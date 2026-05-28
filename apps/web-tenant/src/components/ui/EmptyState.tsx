import { LucideIcon } from 'lucide-react';
import { HTMLAttributes } from 'react';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className = '',
  ...props 
}: EmptyStateProps) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`} {...props}>
      {Icon && <Icon className="w-16 h-16 text-muted-foreground mb-4" />}
      <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground text-center max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};
