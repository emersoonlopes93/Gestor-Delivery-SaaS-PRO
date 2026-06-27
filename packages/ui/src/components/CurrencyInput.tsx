import React, { InputHTMLAttributes, forwardRef } from 'react';
import { maskCurrency, unmaskCurrency } from '@gestor/utils';
import { cn } from '../lib/cn';

export interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | undefined | null;
  onChange: (value: number) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, placeholder, disabled, ...props }, ref) => {
    // maskCurrency takes care of formatting, padding with zeros and initial "R$ 0,00"
    const displayValue = maskCurrency(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // unmaskCurrency extracts the raw digits and divides by 100
      const numericValue = unmaskCurrency(e.target.value);
      onChange(numericValue);
    };

    return (
      <input
        type="text"
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder || "R$ 0,00"}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
