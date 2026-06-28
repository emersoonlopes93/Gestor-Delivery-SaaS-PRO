import React, { InputHTMLAttributes, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { currencyDigitsToNumber, currencyNumberToDigits, maskCurrency, unmask } from '@gestor/utils';
import { cn } from '../lib/cn';

export interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | undefined | null;
  onChange: (value: number) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, placeholder, disabled, ...props }, ref) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const [digits, setDigits] = useState(() => currencyNumberToDigits(value));

    useEffect(() => {
      const nextDigits = currencyNumberToDigits(value);
      if (document.activeElement !== innerRef.current || nextDigits !== digits) {
        setDigits(nextDigits);
      }
    }, [digits, value]);

    const displayValue = useMemo(() => maskCurrency(currencyDigitsToNumber(digits)), [digits]);

    const syncCaretToEnd = () => {
      window.requestAnimationFrame(() => {
        const input = innerRef.current;
        if (!input || document.activeElement !== input) return;
        const position = input.value.length;
        input.setSelectionRange(position, position);
      });
    };

    const assignRef = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
        return;
      }
      if (ref) {
        ref.current = node;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextDigits = unmask(e.target.value) || '0';
      setDigits(nextDigits);
      onChange(currencyDigitsToNumber(nextDigits));
      syncCaretToEnd();
    };

    return (
      <input
        type="text"
        inputMode="numeric"
        ref={assignRef}
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder || 'R$ 0,00'}
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
