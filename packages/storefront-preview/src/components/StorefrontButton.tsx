import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../cn';

export interface StorefrontButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
}

export const StorefrontButton = forwardRef<HTMLButtonElement, StorefrontButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-[var(--storefront-primary)] text-[var(--storefront-primary-foreground)] hover:opacity-90 shadow-sm',
      secondary: 'bg-[var(--storefront-muted)] text-[var(--storefront-foreground)] hover:bg-[var(--storefront-border)]',
      // @allow-theme-risk: background transparente para variante outline
      outline: 'border border-[var(--storefront-border)] bg-transparent hover:bg-[var(--storefront-muted)]',
      ghost: 'hover:bg-[var(--storefront-muted)]',
    };

    const sizes = {
      sm: 'h-9 px-4 text-xs font-bold uppercase tracking-wider',
      md: 'h-11 px-6 text-sm font-bold',
      lg: 'h-14 px-8 text-base font-black',
      xl: 'h-16 px-10 text-lg font-black',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--storefront-radius)] transition-all active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100',
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

StorefrontButton.displayName = 'StorefrontButton';
