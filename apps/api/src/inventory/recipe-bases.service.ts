import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType as PrismaUnitType } from '@prisma/client';
import { CreateRecipeBaseDTO, RecipeBaseComponentDTO, RecipeBaseDetailDTO, UnitType, UpdateRecipeBaseDTO, UpsertRecipeBaseComponentDTO } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import { normalizeRecipeQuantity } from './recipe-unit-normalization';

const MAX_BASE_DEPTH = 10;
type RecipeBaseReader = Pick<PrismaService, 'recipeBase'>;

@Injectable()
export class RecipeBasesService {
  constructor(private readonly prisma: PrismaService) {}

  private decimal(value: unknown, label: string): Prisma.Decimal {
    const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
    if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new BadRequestException(`${label} deve ser positivo e ter no máximo 6 casas decimais.`);
    const decimal = new Prisma.Decimal(text);
    if (!decimal.isFinite() || decimal.lte(0)) throw new BadRequestException(`${label} deve ser positivo e ter no máximo 6 casas decimais.`);
    return decimal;
  }

  private metadata(dto: CreateRecipeBaseDTO | UpdateRecipeBaseDTO) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name || name.length > 150) throw new BadRequestException('Nome da preparação inválido.');
    if (!Object.values(UnitType).includes(dto.outputUnit)) throw new BadRequestException('Unidade de rendimento inválida.');
    return { name, description: typeof dto.description === 'string' && dto.description.trim() ? dto.description.trim() : null, outputUnit: dto.outputUnit as PrismaUnitType, yieldQuantity: this.decimal(dto.yieldQuantity, 'Rendimento') };
  }

  private async detailWith(reader: RecipeBaseReader, tenantId: string, id: string): Promise<RecipeBaseDetailDTO> {
    const base = await reader.recipeBase.findFirst({ where: { id, tenantId }, include: { ingredients: { include: { ingredient: true }, orderBy: { sortOrder: 'asc' } }, childDependencies: { include: { componentBase: true }, orderBy: { sortOrder: 'asc' } } } });
    if (!base) throw new NotFoundException('Preparação não encontrada.');
    const components: RecipeBaseComponentDTO[] = [
      ...base.ingredients.map((component) => ({ id: component.id, type: 'ingredient' as const, ingredientId: component.ingredientId, ingredientName: component.ingredient.name, ingredientUnit: component.ingredient.unit as UnitType, inputQuantity: Number(component.inputQuantity ?? component.quantity), inputUnit: (component.inputUnit ?? component.ingredient.unit) as UnitType, quantity: Number(component.quantity), normalizedUnit: component.ingredient.unit as UnitType, sortOrder: component.sortOrder })),
      ...base.childDependencies.map((component) => ({ id: component.id, type: 'base' as const, baseId: component.componentBaseId, baseName: component.componentBase.name, outputUnit: component.componentBase.outputUnit as UnitType, isActive: component.componentBase.isActive, inputQuantity: Number(component.inputQuantity ?? component.quantity), inputUnit: (component.inputUnit ?? component.componentBase.outputUnit) as UnitType, quantity: Number(component.quantity), normalizedUnit: component.componentBase.outputUnit as UnitType, sortOrder: component.sortOrder })),
    ].sort((left, right) => left.sortOrder - right.sortOrder);
    return { id: base.id, name: base.name, description: base.description, outputUnit: base.outputUnit as UnitType, yieldQuantity: Number(base.yieldQuantity), isActive: base.isActive, archivedAt: base.archivedAt, components };
  }

  async list(tenantId: string) { return this.prisma.recipeBase.findMany({ where: { tenantId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }); }
  async detail(tenantId: string, id: string): Promise<RecipeBaseDetailDTO> { return this.detailWith(this.prisma, tenantId, id); }
  async create(tenantId: string, dto: CreateRecipeBaseDTO) { return this.prisma.recipeBase.create({ data: { tenantId, ...this.metadata(dto) } }); }

  async update(tenantId: string, id: string, dto: UpdateRecipeBaseDTO) {
    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe-bases:${tenantId}`}, 0))`;
      const base = await tx.recipeBase.findFirst({ where: { id, tenantId } });
      if (!base) throw new NotFoundException('Preparação não encontrada.');
      if (!base.isActive) throw new ConflictException('Preparação arquivada deve ser restaurada antes da edição.');
      const metadata = this.metadata(dto);
      if (metadata.outputUnit !== base.outputUnit) {
        const [parentDependency, productLink] = await Promise.all([
          tx.recipeBaseDependency.findFirst({ where: { tenantId, componentBaseId: id }, select: { id: true } }),
          tx.productRecipeBase.findFirst({ where: { tenantId, baseId: id }, select: { id: true } }),
        ]);
        if (parentDependency || productLink) throw new ConflictException({ code: 'RECIPE_BASE_OUTPUT_UNIT_LOCKED', message: 'A unidade de rendimento não pode mudar enquanto a preparação estiver em uso.' });
      }
      return tx.recipeBase.update({ where: { id }, data: metadata });
    });
  }

  async archive(tenantId: string, id: string) {
    const base = await this.prisma.recipeBase.findFirst({ where: { id, tenantId } });
    if (!base) throw new NotFoundException('Preparação não encontrada.');
    return this.prisma.recipeBase.update({ where: { id }, data: base.isActive ? { isActive: false, archivedAt: new Date() } : {} });
  }

  async restore(tenantId: string, id: string) {
    const base = await this.prisma.recipeBase.findFirst({ where: { id, tenantId } });
    if (!base) throw new NotFoundException('Preparação não encontrada.');
    return this.prisma.recipeBase.update({ where: { id }, data: base.isActive ? {} : { isActive: true, archivedAt: null } });
  }

  async replaceComponents(tenantId: string, id: string, components: UpsertRecipeBaseComponentDTO[]) {
    if (!Array.isArray(components)) throw new BadRequestException('A composição deve ser uma lista.');
    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe-bases:${tenantId}`}, 0))`;
      const base = await tx.recipeBase.findFirst({ where: { id, tenantId }, include: { childDependencies: { include: { componentBase: true } } } });
      if (!base) throw new NotFoundException('Preparação não encontrada.');
      if (!base.isActive) throw new ConflictException('Preparação arquivada deve ser restaurada antes da edição.');
      const ingredients = components.filter((component): component is Extract<UpsertRecipeBaseComponentDTO, { type: 'ingredient' }> => component.type === 'ingredient');
      const children = components.filter((component): component is Extract<UpsertRecipeBaseComponentDTO, { type: 'base' }> => component.type === 'base');
      if (ingredients.length + children.length !== components.length) throw new BadRequestException('Tipo de componente inválido.');
      if (new Set(ingredients.map((component) => component.ingredientId)).size !== ingredients.length || new Set(children.map((component) => component.baseId)).size !== children.length) throw new BadRequestException('Componentes duplicados não são permitidos.');
      if (children.some((component) => component.baseId === id)) throw new ConflictException('A preparação não pode depender dela mesma, direta ou indiretamente.');
      const [foundIngredients, foundBases, graph] = await Promise.all([
        tx.ingredient.findMany({ where: { tenantId, id: { in: ingredients.map((component) => component.ingredientId) } } }),
        tx.recipeBase.findMany({ where: { tenantId, id: { in: children.map((component) => component.baseId) } } }),
        tx.recipeBaseDependency.findMany({ where: { tenantId } }),
      ]);
      if (foundIngredients.length !== ingredients.length || foundBases.length !== children.length) throw new NotFoundException('Componente não encontrado.');
      const archivedExisting = new Map(base.childDependencies.filter((dependency) => !dependency.componentBase.isActive).map((dependency) => [dependency.componentBaseId, dependency.quantity]));
      for (const child of children) {
        const candidate = foundBases.find((item) => item.id === child.baseId);
        if (candidate && !candidate.isActive) {
          const original = archivedExisting.get(child.baseId);
          const normalized = normalizeRecipeQuantity(child.inputQuantity, child.inputUnit as PrismaUnitType, candidate.outputUnit);
          if (!original || !normalized.equals(original)) throw new ConflictException('Preparação arquivada só pode ser preservada sem alterar a quantidade ou removida.');
        }
      }
      const edges = new Map<string, string[]>();
      for (const edge of graph.filter((edge) => edge.baseId !== id)) edges.set(edge.baseId, [...(edges.get(edge.baseId) ?? []), edge.componentBaseId]);
      edges.set(id, children.map((component) => component.baseId));
      const visit = (node: string, path = new Set<string>(), depth = 0): void => {
        if (depth > MAX_BASE_DEPTH) throw new ConflictException('A profundidade máxima de preparações foi excedida.');
        if (path.has(node)) throw new ConflictException('A preparação não pode depender dela mesma, direta ou indiretamente.');
        for (const child of edges.get(node) ?? []) visit(child, new Set([...path, node]), depth + 1);
      };
      visit(id);
      await tx.recipeBaseIngredient.deleteMany({ where: { tenantId, baseId: id } });
      await tx.recipeBaseDependency.deleteMany({ where: { tenantId, baseId: id } });
      if (ingredients.length) await tx.recipeBaseIngredient.createMany({ data: ingredients.map((component, index) => {
        const ingredient = foundIngredients.find((item) => item.id === component.ingredientId);
        if (!ingredient) throw new NotFoundException('Componente não encontrado.');
        return { tenantId, baseId: id, ingredientId: component.ingredientId, inputQuantity: this.decimal(component.inputQuantity, 'Quantidade'), inputUnit: component.inputUnit as PrismaUnitType, quantity: normalizeRecipeQuantity(component.inputQuantity, component.inputUnit as PrismaUnitType, ingredient.unit), sortOrder: component.sortOrder ?? index };
      }) });
      if (children.length) await tx.recipeBaseDependency.createMany({ data: children.map((component, index) => {
        const child = foundBases.find((item) => item.id === component.baseId);
        if (!child) throw new NotFoundException('Componente não encontrado.');
        return { tenantId, baseId: id, componentBaseId: component.baseId, inputQuantity: this.decimal(component.inputQuantity, 'Quantidade'), inputUnit: component.inputUnit as PrismaUnitType, quantity: normalizeRecipeQuantity(component.inputQuantity, component.inputUnit as PrismaUnitType, child.outputUnit), sortOrder: component.sortOrder ?? index };
      }) });
      return this.detailWith(tx, tenantId, id);
    });
  }
}
