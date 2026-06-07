import React, { createContext, useContext } from 'react';
import { ProductDetails, ProductOptionGroupLink, OptionGroup, ComboSlot, ComboSlotAllowedItem, Product, ComboPricingType, CatalogPublication, CatalogAvailabilityRule, UpsertPublicationDto } from '@gestor/types';

export type LinkWithGroup = ProductOptionGroupLink & {
  optionGroup: OptionGroup;
};

export type BundleItemWithProduct = {
  id: string;
  comboProductId: string;
  productId: string;
  qty: number;
  sortOrder: number;
  product?: Product;
};

export type BundleSummary = {
  subtotal: number;
  discountTotal: number;
  finalPrice: number;
  pricingType: 'fixed_price' | 'discount_percent' | 'discount_amount';
  pricingValue: number;
};

export type SlotWithAllowed = ComboSlot & {
  allowedItems?: Array<ComboSlotAllowedItem & { product?: Product }>;
};

export type CatalogEditorContextValue = {
  productId: string;
  isNew: boolean;
  isComboMode: boolean;
  product: ProductDetails | null;
  savingStates: Record<string, boolean>;
  setSavingStates: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  loadAll: () => Promise<void>;
  handleSaveProduct: () => Promise<void>;
  goNextWizardStep: () => void;
  goPrevWizardStep: () => void;
  isComboWizard: boolean;
  isProductWizard: boolean;
  onOpenRecipe: () => void;
  
  // Personalization links
  links: LinkWithGroup[];
  moveLink: (id: string, direction: -1 | 1) => void;
  openAddGroupModal: () => void;
  setIsCreateComplementModalOpen: (open: boolean) => void;
  openEditLinkModal: (link: LinkWithGroup) => void;
  removeGroupLink: (id: string) => void;

  // Combo
  bundleItems: BundleItemWithProduct[];
  bundleSummary: BundleSummary | null;
  comboModeState: 'bundle' | 'slot';
  comboPricingType: ComboPricingType;
  setComboPricingType: (val: ComboPricingType) => void;
  comboPricingValue: number;
  setComboPricingValue: (val: number) => void;
  updateComboPricing: () => void;
  openBundleItemModal: (item?: BundleItemWithProduct) => void;
  deleteBundleItem: (id: string) => void;
  convertComboToBundle: () => void;
  slots: SlotWithAllowed[];
  moveSlot: (id: string, dir: -1 | 1) => void;
  openAllowedModal: (slotId: string, item?: ComboSlotAllowedItem & { product?: Product }) => void;
  openSlotModal: (slot?: SlotWithAllowed) => void;
  deleteSlot: (id: string) => void;
  moveAllowed: (slot: SlotWithAllowed, id: string, dir: -1 | 1) => void;
  deleteAllowed: (slotId: string, id: string) => void;

  // Publication
  publication: CatalogPublication | null;
  patchPublication: (payload: UpsertPublicationDto) => Promise<void>;
  rules: CatalogAvailabilityRule[];
  openRuleModal: (rule?: CatalogAvailabilityRule) => void;
  deleteRule: (id: string) => Promise<void>;
  formatChannelLabel: (c: string) => string;
  formatDaysLabel: (days: number[]) => string;
};

const CatalogEditorContext = createContext<CatalogEditorContextValue | undefined>(undefined);

export function CatalogEditorProvider({ children, value }: { children: React.ReactNode; value: CatalogEditorContextValue }) {
  return <CatalogEditorContext.Provider value={value}>{children}</CatalogEditorContext.Provider>;
}

export function useCatalogEditor() {
  const context = useContext(CatalogEditorContext);
  if (!context) {
    throw new Error('useCatalogEditor must be used within a CatalogEditorProvider');
  }
  return context;
}
