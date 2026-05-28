import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'premium';
}

const baseClasses = 'rounded-xl border';

const variantClasses = {
  default: 'bg-card text-card-foreground border-border shadow-sm',
  premium: 'card-premium',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <div ref={ref} className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
