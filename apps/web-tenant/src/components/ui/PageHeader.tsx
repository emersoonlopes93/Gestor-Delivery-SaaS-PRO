import { HTMLAttributes } from 'react';
import { LucideIcon } from 'lucide-react';

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export const PageHeader = ({ 
  title, 
  description, 
  icon: Icon, 
  action,
  className = '',
  ...props 
}: PageHeaderProps) => {
  return (
    <div className={`mb-8 ${className}`} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-8 h-8 text-primary" />}
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
        </div>
        {action && <div className="flex items-center gap-3">{action}</div>}
      </div>
    </div>
  );
};
