import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    MercadoPago: {
      new (publicKey: string, options: { locale: string }): {
        bricks: () => {
          create: (type: string, containerId: string, settings: unknown) => Promise<unknown>;
        };
      };
    };
  }
}

interface CardPaymentProps {
  publicKey: string;
  amount: number;
  onSubmit: (formData: unknown) => Promise<void>;
}

export function CardPayment({ publicKey, amount, onSubmit }: CardPaymentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const brickRef = useRef<unknown>(null);

  useEffect(() => {
    if (!window.MercadoPago || !containerRef.current) return;

    const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
    const bricksBuilder = mp.bricks();

    const renderCardPaymentBrick = async (builder: { create: (type: string, containerId: string, settings: unknown) => Promise<unknown> }) => {
      const settings = {
        initialization: {
          amount: amount,
        },
        callbacks: {
          onReady: () => {
            console.log('Brick is ready');
          },
          onSubmit: (formData: unknown) => {
            return onSubmit(formData);
          },
          onError: (error: unknown) => {
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
