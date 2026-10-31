export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando visão geral" role="status">
      <div className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-60 animate-pulse rounded-2xl border border-border bg-card lg:col-span-2" />
        <div className="h-60 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
      <span className="sr-only">Carregando dados da operação.</span>
    </div>
  );
}
