import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import acaiFallback from './assets/product-fallbacks/acai.webp';
import hamburgueriaFallback from './assets/product-fallbacks/hamburgueria.webp';
import mercadoFallback from './assets/product-fallbacks/mercado.webp';
import otherFallback from './assets/product-fallbacks/other.webp';
import padariaFallback from './assets/product-fallbacks/padaria.webp';
import pizzariaFallback from './assets/product-fallbacks/pizzaria.webp';
import restauranteFallback from './assets/product-fallbacks/restaurante.webp';

export type ProductFallbackSegment =
  | 'PIZZARIA'
  | 'HAMBURGUERIA'
  | 'RESTAURANTE'
  | 'MERCADO'
  | 'ACAI'
  | 'PADARIA'
  | 'OTHER';

export const PRODUCT_FALLBACK_IMAGES: Record<ProductFallbackSegment, string> = {
  PIZZARIA: pizzariaFallback,
  HAMBURGUERIA: hamburgueriaFallback,
  RESTAURANTE: restauranteFallback,
  MERCADO: mercadoFallback,
  ACAI: acaiFallback,
  PADARIA: padariaFallback,
  OTHER: otherFallback,
};

export interface ProductImageResolution {
  src: string;
  fallbackSrc: string;
  source: 'product' | 'segment';
}

export function resolveProductImage(input: {
  productImage?: string | null;
  businessSegment?: ProductFallbackSegment | null;
}): ProductImageResolution {
  const segment = input.businessSegment ?? 'OTHER';
  const fallbackSrc = PRODUCT_FALLBACK_IMAGES[segment] ?? PRODUCT_FALLBACK_IMAGES.OTHER;
  const productImage = input.productImage?.trim();
  return productImage
    ? { src: productImage, fallbackSrc, source: 'product' }
    : { src: fallbackSrc, fallbackSrc, source: 'segment' };
}

export function nextProductImageAfterError(currentSrc: string, fallbackSrc: string): string | null {
  return currentSrc === fallbackSrc ? null : fallbackSrc;
}

interface ResilientProductImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  fallbackSrc: string;
}

export function ResilientProductImage({ src, fallbackSrc, onError, ...props }: ResilientProductImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setFailed(false);
  }, [src]);

  if (failed) return null;

  return (
    <img
      {...props}
      src={currentSrc}
      onError={(event) => {
        onError?.(event);
        const nextSrc = nextProductImageAfterError(currentSrc, fallbackSrc);
        if (nextSrc) {
          setCurrentSrc(nextSrc);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
