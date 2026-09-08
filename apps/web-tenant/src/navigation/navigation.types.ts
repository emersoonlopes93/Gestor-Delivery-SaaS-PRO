import type { LucideIcon } from 'lucide-react';

export type NavigationKind = 'SIDEBAR' | 'CONTEXTUAL' | 'DEEP_LINK' | 'VALID_HIDDEN' | 'LEGACY_CANDIDATE';

export type NavigationItem = {
  id: string;
  label: string;
  path: string;
  icon?: LucideIcon;
  permission?: string;
  module?: string;
  featureFlag?: string;
  featureKey?: string;
  navigationKind: NavigationKind;
  parentId?: string;
  breadcrumbLabel?: string;
  match?: (pathname: string) => boolean;
};

export type NavigationGroup = {
  id: string;
  label: string;
  itemIds: readonly string[];
};

export type SidebarNavigationItem = Pick<NavigationItem, 'id' | 'label' | 'permission' | 'featureFlag' | 'featureKey' | 'match'> & {
  to: string;
  icon: LucideIcon;
  isExternal?: boolean;
};

export type SidebarNavigationGroup = {
  id: string;
  label: string;
  items: readonly SidebarNavigationItem[];
};

export type BreadcrumbMetadata = {
  label: string;
  parentLabel?: string;
};
