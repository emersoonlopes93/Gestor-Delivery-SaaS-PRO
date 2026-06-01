import { StorefrontCategoryLayout } from '@gestor/theme';
import { cn } from '../cn';

interface CategoryNavigationProps {
  categories: Array<{ id: string; name: string; slug: string }>;
  activeCategoryId?: string;
  layout: StorefrontCategoryLayout;
  onCategoryClick: (slug: string) => void;
  className?: string;
}

/**
 * CategoryNavigation - Responsive navigation for store categories.
 * Supports tabs, horizontal-scroll, and sections (sidebar is stubbed).
 */
export function CategoryNavigation({
  categories,
  activeCategoryId,
  layout,
  onCategoryClick,
  className
}: CategoryNavigationProps) {
  if (layout === 'sidebar') {
    // Stubbed sidebar as requested
    return (
      <aside className={cn('hidden md:block w-64 flex-shrink-0', className)}>
        <nav className="sticky top-20 space-y-1">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => onCategoryClick(category.slug)}
              className={cn(
                'w-full text-left px-4 py-2 rounded-[var(--storefront-radius)] text-sm font-medium transition-colors',
                activeCategoryId === category.id
                  ? 'bg-[var(--storefront-primary)] text-[var(--storefront-primary-foreground)]'
                  : 'text-[var(--storefront-foreground)] hover:bg-[var(--storefront-muted)]'
              )}
            >
              {category.name}
            </button>
          ))}
        </nav>
      </aside>
    );
  }

  // Default: Tabs / Horizontal Scroll
  return (
    <div className={cn(
      'sticky top-0 z-10 bg-[var(--storefront-background)] border-b border-[var(--storefront-border)] overflow-x-auto scrollbar-hide',
      className
    )}>
      <div className="flex px-4 min-w-max">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryClick(category.slug)}
            className={cn(
              'px-4 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap',
              activeCategoryId === category.id
                ? 'border-[var(--storefront-primary)] text-[var(--storefront-primary)]'
                : 'border-transparent text-[var(--storefront-muted-foreground)] hover:text-[var(--storefront-foreground)]'
            )}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}
