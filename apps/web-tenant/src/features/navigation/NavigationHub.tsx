import { hasPermission } from '@gestor/auth';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { useTenantCapabilities } from '../../hooks/useTenantCapabilities';
import { filterNavigationItems, getNavigationItems } from '../../navigation/navigationRegistry';
import type { NavigationItem } from '../../navigation/navigation.types';
import { useAuthStore } from '../../stores/auth.store';

type NavigationHubSection = {
  id: string;
  label: string;
  description: string;
  itemIds: readonly string[];
  emphasis: 'primary' | 'secondary';
};

type NavigationHubProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  itemIds: readonly string[];
  sections?: readonly NavigationHubSection[];
};

export function NavigationHub({ title, description, icon, itemIds, sections }: NavigationHubProps) {
  const user = useAuthStore((state) => state.user);
  const { isFeatureVisible } = useTenantCapabilities();
  const items = filterNavigationItems(
    getNavigationItems(itemIds),
    isFeatureVisible,
    (permission) => !permission || hasPermission(user?.permissions ?? [], permission),
    (module) => !module || user?.enabledModules?.includes(module) === true,
  );

  return (
    <section className="mx-auto max-w-7xl p-4 text-left md:p-6">
      <PageHeader className="mb-6" title={title} description={description} icon={icon} />
      {items.length ? (
        sections ? <SectionedNavigation title={title} items={items} sections={sections} /> : (
          <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`Navegação de ${title}`}>
            {items.map((entry) => <HubLink key={entry.id} entry={entry} variant="default" />)}
          </nav>
        )
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          Nenhuma área desta seção está disponível para o seu acesso.
        </Card>
      )}
    </section>
  );
}

type SectionedNavigationProps = {
  title: string;
  items: readonly NavigationItem[];
  sections: readonly NavigationHubSection[];
};

function SectionedNavigation({ title, items, sections }: SectionedNavigationProps) {
  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionItems = items.filter((entry) => section.itemIds.includes(entry.id));
        if (!sectionItems.length) return null;
        const primary = section.emphasis === 'primary';

        return (
          <section key={section.id} aria-labelledby={`${section.id}-heading`}>
            <div className={`mb-3 flex items-baseline justify-between gap-4 ${primary ? '' : 'border-t border-border pt-6'}`}>
              <div>
                <h2 id={`${section.id}-heading`} className={`font-semibold tracking-tight text-foreground ${primary ? 'text-base' : 'text-sm'}`}>
                  {section.label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
              </div>
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {sectionItems.length} {sectionItems.length === 1 ? 'área' : 'áreas'}
              </span>
            </div>
            <nav className={`grid grid-cols-1 gap-3 ${primary ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`} aria-label={`${section.label} em ${title}`}>
              {sectionItems.map((entry) => <HubLink key={entry.id} entry={entry} variant={primary ? 'primary' : 'secondary'} />)}
            </nav>
          </section>
        );
      })}
    </div>
  );
}

type HubLinkProps = {
  entry: NavigationItem;
  variant: 'default' | 'primary' | 'secondary';
};

function HubLink({ entry, variant }: HubLinkProps) {
  const Icon = entry.icon;
  if (!Icon) return null;
  const primary = variant === 'primary';
  const defaultVariant = variant === 'default';

  return (
    <Link to={entry.path} aria-label={`Abrir ${entry.hubLabel ?? entry.label}`} className="group block focus:outline-none">
      <Card className={`h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/40 group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 ${primary ? 'min-h-[12rem] border-primary/30 bg-primary/5 p-5' : 'p-4'}`}>
        {primary ? (
          <div className="flex h-full flex-col items-start">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="mt-5 block text-lg font-semibold tracking-tight text-foreground">{entry.hubLabel ?? entry.label}</span>
            <span className="mt-2 block text-sm leading-5 text-muted-foreground">{entry.hubDescription}</span>
            <ArrowRight className="mt-auto self-end h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
              <Icon className={`h-5 w-5 ${defaultVariant ? '' : 'opacity-80'}`} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block font-semibold text-foreground ${defaultVariant ? '' : 'text-sm'}`}>{entry.hubLabel ?? entry.label}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{entry.hubDescription}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        )}
      </Card>
    </Link>
  );
}

export function ContextualNavigation({ itemIds }: Pick<NavigationHubProps, 'itemIds'>) {
  const user = useAuthStore((state) => state.user);
  const { isFeatureVisible } = useTenantCapabilities();
  const location = useLocation();
  const items = filterNavigationItems(
    getNavigationItems(itemIds),
    isFeatureVisible,
    (permission) => !permission || hasPermission(user?.permissions ?? [], permission),
    (module) => !module || user?.enabledModules?.includes(module) === true,
  );

  if (!items.length) return null;

  return (
    <nav className="mb-6 flex max-w-full gap-1 overflow-x-auto border-b border-border" aria-label="Navegação contextual">
      {items.map((entry) => {
        const Icon = entry.icon;
        if (!Icon) return null;
        const isActive = location.pathname === entry.path;
        return (
          <NavLink
            key={entry.id}
            to={entry.path}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {entry.hubLabel ?? entry.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
