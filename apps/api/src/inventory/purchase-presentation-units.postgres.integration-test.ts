import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PaymentStatus, UnitType as SharedUnitType } from '@gestor/types';
import { PrismaClient, UnitType } from '@prisma/client';
import { IngredientBaseUnitGuardService } from './ingredient-base-unit-guard.service';
import { IngredientsService } from './ingredients.service';
import { PurchasePresentationsService } from './purchase-presentations.service';
import { PurchasesService } from '../purchasing/purchases.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Canonical purchase presentation integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Canonical purchase presentations PostgreSQL proof', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];
  const presentationService = new PurchasePresentationsService(prisma as never);
  const ingredientService = new IngredientsService(prisma as never, new IngredientBaseUnitGuardService());
  const purchasesService = new PurchasesService(prisma as never);

  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture(unit: UnitType = UnitType.ml) {
    const token = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `Presentation ${token}`, slug: `presentation-${token}` } });
    tenantIds.push(tenant.id);
    const [ingredient, supplier] = await Promise.all([
      prisma.ingredient.create({ data: { tenantId: tenant.id, name: `Ingredient ${token}`, sku: `presentation-${token}`, unit } }),
      prisma.supplier.create({ data: { tenantId: tenant.id, name: `Supplier ${token}` } }),
    ]);
    return { tenant, ingredient, supplier };
  }

  it('normalizes canonical commercial content with Decimal semantics and rejects cross-dimension units', async () => {
    const volume = await fixture(UnitType.ml);
    const presentation = await presentationService.create(volume.tenant.id, volume.ingredient.id, {
      label: 'Caixa com 10 litros', contentQuantity: 10, contentUnit: SharedUnitType.L,
    });
    expect(presentation).toMatchObject({ contentQuantity: 10, contentUnit: SharedUnitType.L, conversionFactor: 10000, status: 'CANONICAL' });

    const mass = await fixture(UnitType.kg);
    const grams = await presentationService.create(mass.tenant.id, mass.ingredient.id, {
      label: 'Pacote 500 g', contentQuantity: 500, contentUnit: SharedUnitType.G,
    });
    expect(grams.conversionFactor).toBe(0.5);
    await expect(presentationService.create(volume.tenant.id, volume.ingredient.id, {
      label: 'Invalida', contentQuantity: 1, contentUnit: SharedUnitType.KG,
    })).rejects.toMatchObject({ status: 400 });
  });

  it('keeps legacy presentations readable without guessing content and allows explicit canonicalization', async () => {
    const data = await fixture(UnitType.l);
    const legacy = await prisma.purchasePresentation.create({
      data: { tenantId: data.tenant.id, ingredientId: data.ingredient.id, label: 'Caixa antiga', conversionFactor: '10000' },
    });
    const listed = await presentationService.findAll(data.tenant.id, data.ingredient.id);
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: legacy.id, status: 'LEGACY_REQUIRES_REVIEW', contentQuantity: null, contentUnit: null })]));
    const canonical = await presentationService.update(data.tenant.id, data.ingredient.id, legacy.id, {
      contentQuantity: 10, contentUnit: SharedUnitType.L,
    });
    expect(canonical).toMatchObject({ status: 'CANONICAL', conversionFactor: 10, contentQuantity: 10, contentUnit: SharedUnitType.L });
  });

  it('freezes canonical snapshots for purchases and preserves them after edit and archive', async () => {
    const data = await fixture(UnitType.ml);
    const presentation = await presentationService.create(data.tenant.id, data.ingredient.id, {
      label: 'Caixa 10 L', contentQuantity: 10, contentUnit: SharedUnitType.L,
    });
    const purchase = await purchasesService.create(data.tenant.id, {
      supplierId: data.supplier.id, idempotencyKey: `presentation-snapshot-${randomUUID()}`, paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: data.ingredient.id, purchasePresentationId: presentation.id, purchaseQuantity: 1, lineTotal: 12.99 }],
    });
    const item = await prisma.purchaseItem.findFirstOrThrow({ where: { purchaseId: purchase.id } });
    expect(Number(item.quantity)).toBe(10000);
    expect(Number(item.purchasePresentationContentQuantitySnapshot)).toBe(10);
    expect(item.purchasePresentationContentUnitSnapshot).toBe(UnitType.l);
    expect(item.ingredientBaseUnitSnapshot).toBe(UnitType.ml);

    await presentationService.update(data.tenant.id, data.ingredient.id, presentation.id, { label: 'Caixa renomeada', contentQuantity: 5, contentUnit: SharedUnitType.L });
    await presentationService.archive(data.tenant.id, data.ingredient.id, presentation.id);
    const historical = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(historical.conversionFactorSnapshot)).toBe(10000);
    expect(Number(historical.purchasePresentationContentQuantitySnapshot)).toBe(10);
    expect(historical.purchasePresentationContentUnitSnapshot).toBe(UnitType.l);
    await expect(purchasesService.create(data.tenant.id, {
      supplierId: data.supplier.id, idempotencyKey: `archived-${randomUUID()}`, paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: data.ingredient.id, purchasePresentationId: presentation.id, purchaseQuantity: 1, lineTotal: 1 }],
    })).rejects.toMatchObject({ status: 404 });
  });

  it('enforces tenant scope and lifecycle delete rules', async () => {
    const first = await fixture();
    const second = await fixture();
    const unused = await presentationService.create(first.tenant.id, first.ingredient.id, { label: 'Pacote', contentQuantity: 50, contentUnit: SharedUnitType.ML });
    await expect(presentationService.archive(second.tenant.id, second.ingredient.id, unused.id)).rejects.toMatchObject({ status: 404 });
    await presentationService.remove(first.tenant.id, first.ingredient.id, unused.id);
    expect(await prisma.purchasePresentation.findUnique({ where: { id: unused.id } })).toBeNull();

    const used = await presentationService.create(first.tenant.id, first.ingredient.id, { label: 'Caixa usada', contentQuantity: 1, contentUnit: SharedUnitType.L });
    await purchasesService.create(first.tenant.id, {
      supplierId: first.supplier.id, idempotencyKey: `used-${randomUUID()}`, paymentStatus: PaymentStatus.PENDING,
      items: [{ ingredientId: first.ingredient.id, purchasePresentationId: used.id, purchaseQuantity: 1, lineTotal: 1 }],
    });
    await expect(presentationService.remove(first.tenant.id, first.ingredient.id, used.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('never leaves a presentation derived for an obsolete ingredient base unit', async () => {
    const data = await fixture(UnitType.l);
    const [created, changed] = await Promise.allSettled([
      presentationService.create(data.tenant.id, data.ingredient.id, { label: 'Botija', contentQuantity: 350, contentUnit: SharedUnitType.ML }),
      ingredientService.update(data.tenant.id, data.ingredient.id, { unit: SharedUnitType.ML }),
    ]);
    const finalIngredient = await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } });
    const finalPresentations = await prisma.purchasePresentation.findMany({ where: { tenantId: data.tenant.id, ingredientId: data.ingredient.id } });
    if (created.status === 'fulfilled') {
      expect(changed.status).toBe('rejected');
      expect(finalIngredient.unit).toBe(UnitType.l);
      expect(finalPresentations[0]?.conversionFactor.toString()).toBe('0.35');
    } else {
      expect(changed.status).toBe('fulfilled');
      expect(finalIngredient.unit).toBe(UnitType.ml);
      expect(finalPresentations).toHaveLength(0);
    }
  });
});
