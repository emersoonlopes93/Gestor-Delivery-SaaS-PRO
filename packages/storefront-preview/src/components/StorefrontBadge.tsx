import { cn } from '../cn';

interface StorefrontBadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive';
  className?: string;
}

export function StorefrontBadge({ children, variant = 'primary', className }: StorefrontBadgeProps) {
  const variants = {
    primary: 'bg-[var(--storefront-primary)] text-[var(--storefront-primary-foreground)]',
    secondary: 'bg-[var(--storefront-muted)] text-[var(--storefront-muted-foreground)]',
    outline: 'border border-[var(--storefront-border)] text-[var(--storefront-foreground)]',
    destructive: 'bg-red-500 text-white',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-[var(--storefront-radius)] text-[10px] font-bold uppercase tracking-tight',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
