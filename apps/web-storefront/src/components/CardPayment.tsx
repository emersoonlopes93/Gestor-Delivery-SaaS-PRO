import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

interface CardPaymentProps {
  publicKey: string;
  amount: number;
  onSubmit: (formData: any) => Promise<void>;
}

export function CardPayment({ publicKey, amount, onSubmit }: CardPaymentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const brickRef = useRef<any>(null);

  useEffect(() => {
    if (!window.MercadoPago || !containerRef.current) return;

    const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
    const bricksBuilder = mp.bricks();

    const renderCardPaymentBrick = async (builder: any) => {
      const settings = {
        initialization: {
          amount: amount,
        },
        callbacks: {
          onReady: () => {
            console.log('Brick is ready');
          },
          onSubmit: (formData: any) => {
            return onSubmit(formData);
          },
          onError: (error: any) => {
            console.error('Brick error', error);
          },
        },
      };

      brickRef.current = await builder.create('cardPayment', 'cardPaymentBrick_container', settings);
    };

    renderCardPaymentBrick(bricksBuilder);

    return () => {
      if (brickRef.current) {
        // Brick unmount if possible or cleanup
        const container = document.getElementById('cardPaymentBrick_container');
        if (container) container.innerHTML = '';
      }
    };
  }, [publicKey, amount, onSubmit]);

  return (
    <div id="cardPaymentBrick_container" ref={containerRef} className="mt-4" />
  );
}
