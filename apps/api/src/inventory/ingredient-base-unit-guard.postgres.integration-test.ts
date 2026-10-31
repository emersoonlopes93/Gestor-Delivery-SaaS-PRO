import { randomUUID } from 'node:crypto';
import { PrismaClient, StockMovementType, UnitType } from '@prisma/client';
import type { UnitType as SharedUnitType } from '@gestor/types';
import { IngredientsService } from './ingredients.service';
import { IngredientBaseUnitGuardService } from './ingredient-base-unit-guard.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Ingredient base-unit guard integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Ingredient base-unit guard PostgreSQL proof', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];
  const service = new IngredientsService(prisma as never, new IngredientBaseUnitGuardService());

  beforeAll(async () => { assertEphemeralDatabase(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture() {
    const token = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `Unit guard ${token}`, slug: `unit-guard-${token}` } });
    tenantIds.push(tenant.id);
    const ingredient = await prisma.ingredient.create({
      data: { tenantId: tenant.id, name: `Ingredient ${token}`, sku: `ingredient-${token}`, unit: UnitType.l },
    });
    return { tenant, ingredient };
  }

  async function expectLocked(tenantId: string, ingredientId: string, requestedUnit: UnitType = UnitType.ml) {
    await expect(service.update(tenantId, ingredientId, { unit: requestedUnit as SharedUnitType })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INGREDIENT_BASE_UNIT_LOCKED' }),
      status: 409,
    });
  }

  it('allows unused same- and cross-dimension changes, but preserves other edits when the unit is locked', async () => {
    const data = await fixture();
    await service.update(data.tenant.id, data.ingredient.id, { unit: UnitType.ml as SharedUnitType });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } })).unit).toBe(UnitType.ml);
    await prisma.stockMovement.create({ data: { tenantId: data.tenant.id, ingredientId: data.ingredient.id, type: StockMovementType.in, quantity: '1' } });
    await service.update(data.tenant.id, data.ingredient.id, { unit: UnitType.ml as SharedUnitType, name: 'Renamed' });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } })).name).toBe('Renamed');
    await expectLocked(data.tenant.id, data.ingredient.id, UnitType.l);
  });

  it('blocks stock state and history without partially updating metadata', async () => {
    const data = await fixture();
    await prisma.ingredient.update({ where: { id: data.ingredient.id }, data: { currentStock: '1' } });
    await expect(service.update(data.tenant.id, data.ingredient.id, { unit: UnitType.ml as SharedUnitType, name: 'Must not persist' })).rejects.toMatchObject({ status: 409 });
    const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } });
    expect(after.unit).toBe(UnitType.l);
    expect(after.name).toBe(data.ingredient.name);
  });

  it('blocks recipes and active or inactive purchase presentations', async () => {
    const recipe = await fixture();
    const product = await prisma.product.create({ data: { tenantId: recipe.tenant.id, name: `Product ${randomUUID()}`, slug: `product-${randomUUID()}`, basePrice: 1 } });
    await prisma.productRecipeIngredient.create({ data: { tenantId: recipe.tenant.id, productId: product.id, ingredientId: recipe.ingredient.id, inputQuantity: '1', inputUnit: UnitType.l, quantity: '1' } });
    await expectLocked(recipe.tenant.id, recipe.ingredient.id);

    const presentation = await fixture();
    await prisma.purchasePresentation.create({ data: { tenantId: presentation.tenant.id, ingredientId: presentation.ingredient.id, label: 'Inactive pack', conversionFactor: '50', isActive: false } });
    await expectLocked(presentation.tenant.id, presentation.ingredient.id);
  });

  it('blocks recipe-base components and ignores cross-tenant references', async () => {
    const baseFixture = await fixture();
    const base = await prisma.recipeBase.create({ data: { tenantId: baseFixture.tenant.id, name: `Base ${randomUUID()}`, outputUnit: UnitType.l, yieldQuantity: '1' } });
    await prisma.recipeBaseIngredient.create({ data: { tenantId: baseFixture.tenant.id, baseId: base.id, ingredientId: baseFixture.ingredient.id, inputQuantity: '1', inputUnit: UnitType.l, quantity: '1' } });
    await expectLocked(baseFixture.tenant.id, baseFixture.ingredient.id);

    const isolated = await fixture();
    const otherTenant = await prisma.tenant.create({ data: { name: `Other ${randomUUID()}`, slug: `other-${randomUUID()}` } });
    tenantIds.push(otherTenant.id);
    await prisma.stockMovement.create({ data: { tenantId: otherTenant.id, ingredientId: isolated.ingredient.id, type: StockMovementType.in, quantity: '1' } });
    await expect(service.update(isolated.tenant.id, isolated.ingredient.id, { unit: UnitType.ml as SharedUnitType })).resolves.toMatchObject({ unit: 'ml' });
  });

  it('serializes a concurrent dependent writer before checking and changing the base unit', async () => {
    const data = await fixture();
    let notifyLocked: (() => void) | undefined;
    let releaseWriter: (() => void) | undefined;
    const writerLocked = new Promise<void>((resolve) => { notifyLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseWriter = resolve; });

    const writer = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ingredients WHERE id = ${data.ingredient.id} FOR KEY SHARE`;
      notifyLocked?.();
      await release;
      await tx.stockMovement.create({
        data: { tenantId: data.tenant.id, ingredientId: data.ingredient.id, type: StockMovementType.in, quantity: '1' },
      });
    });

    await writerLocked;
    const unitChange = service.update(data.tenant.id, data.ingredient.id, { unit: UnitType.ml as SharedUnitType });
    const unitChangeSettledTooEarly = await Promise.race([
      unitChange.then(() => true, () => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 40)),
    ]);
    expect(unitChangeSettledTooEarly).toBe(false);

    releaseWriter?.();
    await writer;
    await expect(unitChange).rejects.toMatchObject({ status: 409 });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } })).unit).toBe(UnitType.l);
  });

  it('rechecks a stale same-unit request under the lock before allowing it to persist', async () => {
    const data = await fixture();
    let notifyInitialRead: (() => void) | undefined;
    let releaseStaleRequest: (() => void) | undefined;
    const initialRead = new Promise<void>((resolve) => { notifyInitialRead = resolve; });
    const release = new Promise<void>((resolve) => { releaseStaleRequest = resolve; });

    class DelayedIngredientsService extends IngredientsService {
      override async findOne(tenantId: string, id: string) {
        const initial = await super.findOne(tenantId, id);
        notifyInitialRead?.();
        await release;
        return initial;
      }
    }

    const staleRequestService = new DelayedIngredientsService(prisma as never, new IngredientBaseUnitGuardService());
    const staleSameUnitRequest = staleRequestService.update(data.tenant.id, data.ingredient.id, { unit: UnitType.l as SharedUnitType });
    await initialRead;

    await service.update(data.tenant.id, data.ingredient.id, { unit: UnitType.ml as SharedUnitType });
    await prisma.stockMovement.create({
      data: { tenantId: data.tenant.id, ingredientId: data.ingredient.id, type: StockMovementType.in, quantity: '1' },
    });
    releaseStaleRequest?.();

    await expect(staleSameUnitRequest).rejects.toMatchObject({ status: 409 });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: data.ingredient.id } })).unit).toBe(UnitType.ml);
  });
});
