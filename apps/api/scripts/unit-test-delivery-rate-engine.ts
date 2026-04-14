import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { DeliveryRateService } from '../src/delivery/delivery-rate.service';
import type { DeliveryRateRule } from '@prisma/client';

declare const process: { exitCode?: number };

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string, payload?: unknown) {
  const fullDetail = payload ? `${detail} | Payload: ${JSON.stringify(payload)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  // eslint-disable-next-line no-console
  console.log(condition ? `  OK  ${name}` : `  ERR ${name}: ${fullDetail}`);
}

function makeRule(
  partial: Partial<DeliveryRateRule> & Pick<DeliveryRateRule, 'id' | 'tenantId' | 'type'>,
): DeliveryRateRule {
  const now = new Date();
  return {
    id: partial.id,
    tenantId: partial.tenantId,
    type: partial.type,
    isActive: partial.isActive ?? true,
    priority: partial.priority ?? 1000,
    isFallback: partial.isFallback ?? false,

    neighborhood: partial.neighborhood ?? null,
    rate: partial.rate ?? null,

    minKm: partial.minKm ?? null,
    maxKm: partial.maxKm ?? null,
    ratePerKm: partial.ratePerKm ?? null,
    minDistanceKm: partial.minDistanceKm ?? null,
    maxDistanceKm: partial.maxDistanceKm ?? null,

    fixedRate: partial.fixedRate ?? null,

    geoJson: partial.geoJson ?? null,
    polygonCoordinates: partial.polygonCoordinates ?? null,

    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

async function main() {
  const tenantId = 't1';

  const rules: DeliveryRateRule[] = [
    makeRule({
      id: 'fixed-fallback',
      tenantId,
      type: 'fixed',
      fixedRate: new Prisma.Decimal(9.9),
      isFallback: true,
      priority: 999,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }),
    makeRule({
      id: 'bairro-centro',
      tenantId,
      type: 'neighborhood',
      neighborhood: 'centro',
      rate: new Prisma.Decimal(4.5),
      priority: 10,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }),
    makeRule({
      id: 'dist-0-10',
      tenantId,
      type: 'distance',
      minDistanceKm: new Prisma.Decimal(0),
      maxDistanceKm: new Prisma.Decimal(10),
      ratePerKm: new Prisma.Decimal(2),
      priority: 50,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }),
    makeRule({
      id: 'bairro-centro-menos-prioritario',
      tenantId,
      type: 'neighborhood',
      neighborhood: 'centro',
      rate: new Prisma.Decimal(6.0),
      priority: 20,
      createdAt: new Date('2024-01-02T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    }),
  ];

  const prismaMock = {
    deliveryRateRule: {
      findMany: async (args?: Prisma.DeliveryRateRuleFindManyArgs) => {
        const tenantIdArg = args?.where && 'tenantId' in args.where ? (args.where.tenantId as string) : tenantId;
        const isActiveArg = args?.where && 'isActive' in args.where ? (args.where.isActive as boolean) : true;

        const filtered = rules.filter((r) => r.tenantId === tenantIdArg && r.isActive === isActiveArg);

        const sorted = [...filtered].sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        return sorted;
      },
      findFirst: async () => null,
      create: async () => {
        throw new Error('not implemented in unit test');
      },
      update: async () => {
        throw new Error('not implemented in unit test');
      },
      delete: async () => {
        throw new Error('not implemented in unit test');
      },
    },
  };

  const svc = new DeliveryRateService(prismaMock);

  const byNeighborhood = await svc.calculateRate({
    tenantId,
    address: { neighborhood: ' Centro ' },
    distanceKm: 5,
  });
  assert('bairro válido escolhe regra de bairro', byNeighborhood.fee === 4.5, `fee=${byNeighborhood.fee}`, byNeighborhood);

  const byDistance = await svc.calculateRate({
    tenantId,
    address: { neighborhood: 'Outro' },
    distanceKm: 5,
  });
  assert('distância válida escolhe regra de distância', byDistance.fee === 10, `fee=${byDistance.fee}`, byDistance);

  const byFallback = await svc.calculateRate({
    tenantId,
    address: { neighborhood: 'Nada' },
    distanceKm: null,
  });
  assert('fallback funciona quando nada casa', byFallback.fee === 9.9, `fee=${byFallback.fee}`, byFallback);

  // Error when no fallback exists
  const rulesWithoutFallback = rules.filter((r) => r.id !== 'fixed-fallback');
  const prismaNoFallback = {
    deliveryRateRule: {
      findMany: async () => rulesWithoutFallback,
      findFirst: async () => null,
      create: async () => {
        throw new Error('not implemented in unit test');
      },
      update: async () => {
        throw new Error('not implemented in unit test');
      },
      delete: async () => {
        throw new Error('not implemented in unit test');
      },
    },
  };
  const svcNoFallback = new DeliveryRateService(prismaNoFallback);

  let thrown = false;
  try {
    await svcNoFallback.calculateRate({ tenantId, address: { neighborhood: 'Nada' }, distanceKm: null });
  } catch (err: unknown) {
    thrown = err instanceof UnprocessableEntityException;
  }
  assert('sem fallback lança erro controlado', thrown, 'expected UnprocessableEntityException');

  const failed = results.filter((r) => !r.passed);
  // eslint-disable-next-line no-console
  console.log(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    failed.forEach((f) => console.log(`- ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`UNIT TEST DELIVERY RATE ENGINE crashed: ${String(err)}`);
  process.exitCode = 1;
});

export {};
