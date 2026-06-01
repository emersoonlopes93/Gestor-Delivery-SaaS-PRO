import { cn } from '../cn';

interface StorefrontEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StorefrontEmptyState({ title, description, icon, className }: StorefrontEmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 text-center bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)]',
      className
    )}>
      {icon && <div className="mb-4 text-[var(--storefront-muted-foreground)]">{icon}</div>}
      <h3 className="text-lg font-bold text-[var(--storefront-foreground)]">{title}</h3>
      {description && <p className="mt-1 text-sm text-[var(--storefront-muted-foreground)]">{description}</p>}
    </div>
  );
}
