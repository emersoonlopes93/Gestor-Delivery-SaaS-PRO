declare const process: {
  env: Record<string, string | undefined>;
  stdout: { write: (value: string) => void };
  stderr: { write: (value: string) => void };
  exitCode: number;
  hrtime: { bigint: () => bigint };
};

type SampleStats = {
  endpoint: string;
  samples: number[];
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 20);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 3);

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function request(path: string, token: string): Promise<number> {
  const start = nowMs();
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const elapsed = nowMs() - start;

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Request failed: ${path} status=${response.status} body=${body}`);
  }

  await response.text();
  return elapsed;
}

async function login(): Promise<string> {
  const response = await fetch(`${API}/auth/tenant/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TENANT_EMAIL,
      password: TENANT_PASSWORD,
      tenantSlug: TENANT_SLUG,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: { accessToken?: string };
  };

  if (!response.ok || !payload?.data?.accessToken) {
    throw new Error(`Login failed status=${response.status}`);
  }

  return payload.data.accessToken;
}

async function benchmarkEndpoint(endpoint: string, token: string): Promise<SampleStats> {
  for (let i = 0; i < WARMUP; i++) {
    await request(endpoint, token);
  }

  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    samples.push(await request(endpoint, token));
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avgMs = samples.reduce((acc, value) => acc + value, 0) / samples.length;

  return {
    endpoint,
    samples,
    avgMs,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function format(stats: SampleStats): string {
  return [
    `endpoint=${stats.endpoint}`,
    `avg=${stats.avgMs.toFixed(2)}ms`,
    `p50=${stats.p50Ms.toFixed(2)}ms`,
    `p95=${stats.p95Ms.toFixed(2)}ms`,
    `min=${stats.minMs.toFixed(2)}ms`,
    `max=${stats.maxMs.toFixed(2)}ms`,
    `n=${stats.samples.length}`,
  ].join(' | ');
}

async function main() {
  const token = await login();
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);

  const query = `startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(now.toISOString())}`;

  const endpoints = [`/analytics/dashboard?${query}`, `/analytics/costs?${query}`];
  process.stdout.write(`Benchmark API: ${API}\n`);
  process.stdout.write(`Tenant: ${TENANT_SLUG} | Iterations: ${ITERATIONS} | Warmup: ${WARMUP}\n\n`);

  for (const endpoint of endpoints) {
    const stats = await benchmarkEndpoint(endpoint, token);
    process.stdout.write(`${format(stats)}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Benchmark failed: ${String(error)}\n`);
  process.exitCode = 1;
});

export {};
