import type { StorefrontProductPayload, StorefrontShowcasePayload } from '@gestor/types';
import type { StorefrontImageMode, StorefrontProductLayout } from '@gestor/theme';
import { SmartShowcase as SharedSmartShowcase, toStorefrontProduct } from '@gestor/storefront-ui';

type SmartShowcaseProps = {
  showcase?: StorefrontShowcasePayload;
  productLayout: StorefrontProductLayout;
  imageMode?: StorefrontImageMode;
  showDescription?: boolean;
  showBadges?: boolean;
  onSelectProduct: (product: StorefrontProductPayload) => void;
};

export function SmartShowcase({
  showcase,
  productLayout,
  imageMode,
  showDescription,
  showBadges,
  onSelectProduct,
}: SmartShowcaseProps) {
  if (!showcase?.products.length) return null;

  return (
    <SharedSmartShowcase
      title={showcase.title}
      products={showcase.products.map(toStorefrontProduct)}
      productLayout={productLayout}
      imageMode={imageMode}
      showDescription={showDescription}
      showBadges={showBadges}
      onSelectProduct={(product) => {
        const source = showcase.products.find((item) => item.id === product.id);
        if (source) onSelectProduct(source);
      }}
    />
  );
}
