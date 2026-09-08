import { hasPermission } from '@gestor/auth';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { useTenantCapabilities } from '../../hooks/useTenantCapabilities';
import { filterNavigationItems, getNavigationItems } from '../../navigation/navigationRegistry';
import { useAuthStore } from '../../stores/auth.store';

type NavigationHubProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  itemIds: readonly string[];
};

export function NavigationHub({ title, description, icon, itemIds }: NavigationHubProps) {
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
        <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`Navegação de ${title}`}>
          {items.map((entry) => {
            const Icon = entry.icon;
            if (!Icon) return null;
            return (
              <Link key={entry.id} to={entry.path} className="group block focus:outline-none">
                <Card className="h-full p-4 transition-colors group-hover:border-primary/40 group-hover:bg-muted/40 group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-foreground">{entry.hubLabel ?? entry.label}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{entry.hubDescription}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </div>
                </Card>
              </Link>
            );
          })}
        </nav>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          Nenhuma área desta seção está disponível para o seu acesso.
        </Card>
      )}
    </section>
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
