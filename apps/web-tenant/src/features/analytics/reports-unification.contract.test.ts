import { readFileSync } from 'node:fs';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('reports and performance unification contract', () => {
  it('keeps reports as the canonical route and routes the legacy performance URL to its tab', () => {
    const app = read('../../App.tsx');
    const reports = read('./ReportsPage.tsx');

    expect(app).toContain('path="/analytics/reports"');
    expect(app).toContain('<ReportsPage />');
    expect(app).toContain('path="/analytics/performance"');
    expect(app).toContain('<ReportsPage initialTab="performance" />');
    expect(reports).toContain("type ReportTab = 'overview' | 'performance'");
    expect(reports).toContain('role="tablist"');
    expect(reports).toContain('new URLSearchParams(searchParams)');
  });

  it('shares one period control and avoids mounting duplicate performance headers', () => {
    const reports = read('./ReportsPage.tsx');
    const performance = read('./PerformancePage.tsx');

    expect(reports).toContain('Comparar período anterior');
    expect(reports).toContain('<PerformanceInsights from={from} to={to} compare={compare} />');
    expect(performance).toContain('export function PerformanceInsights');
    expect(performance).not.toContain('PageHeader');
    expect(performance).not.toContain('Resumo de desempenho');
    expect(performance).not.toContain("analytics-performance-overview");
    expect(performance).toContain('Funil de conversão');
    expect(performance).toContain('Produtos em destaque');
  });
});
