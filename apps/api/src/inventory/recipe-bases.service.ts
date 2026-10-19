import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType as PrismaUnitType } from '@prisma/client';
import { CreateRecipeBaseDTO, RecipeBaseDetailDTO, UnitType, UpdateRecipeBaseDTO, UpsertRecipeBaseComponentDTO } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

const MAX_BASE_DEPTH = 10;

@Injectable()
export class RecipeBasesService {
  constructor(private readonly prisma: PrismaService) {}

  private decimal(value: number, label: string): Prisma.Decimal {
    if (!Number.isFinite(value) || value <= 0 || !/^\d+(\.\d{1,6})?$/.test(String(value))) throw new BadRequestException(`${label} deve ser positivo e ter no máximo 6 casas decimais.`);
    return new Prisma.Decimal(value);
  }
  private data(dto: CreateRecipeBaseDTO | UpdateRecipeBaseDTO) {
    const name = dto.name.trim();
    if (!name || name.length > 150) throw new BadRequestException('Nome da preparação inválido.');
    if (!Object.values(UnitType).includes(dto.outputUnit)) throw new BadRequestException('Unidade de rendimento inválida.');
    return { name, description: dto.description?.trim() || null, outputUnit: dto.outputUnit as PrismaUnitType, yieldQuantity: this.decimal(dto.yieldQuantity, 'Rendimento') };
  }
  async list(tenantId: string) { return this.prisma.recipeBase.findMany({ where: { tenantId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }); }
  async detail(tenantId: string, id: string): Promise<RecipeBaseDetailDTO> {
    const base = await this.prisma.recipeBase.findFirst({ where: { id, tenantId }, include: { ingredients: { include: { ingredient: true } }, childDependencies: { include: { componentBase: true } } } });
    if (!base) throw new NotFoundException('Preparação não encontrada.');
    return { id: base.id, name: base.name, description: base.description, outputUnit: base.outputUnit as UnitType, yieldQuantity: Number(base.yieldQuantity), isActive: base.isActive, archivedAt: base.archivedAt, components: [...base.ingredients.map((x) => ({ id: x.id, type: 'ingredient' as const, ingredientId: x.ingredientId, ingredientName: x.ingredient.name, ingredientUnit: x.ingredient.unit as UnitType, quantity: Number(x.quantity), sortOrder: x.sortOrder })), ...base.childDependencies.map((x) => ({ id: x.id, type: 'base' as const, baseId: x.componentBaseId, baseName: x.componentBase.name, outputUnit: x.componentBase.outputUnit as UnitType, isActive: x.componentBase.isActive, quantity: Number(x.quantity), sortOrder: x.sortOrder }))] };
  }
  async create(tenantId: string, dto: CreateRecipeBaseDTO) { return this.prisma.recipeBase.create({ data: { tenantId, ...this.data(dto) } }); }
  async update(tenantId: string, id: string, dto: UpdateRecipeBaseDTO) { const base = await this.prisma.recipeBase.findFirst({ where: { id, tenantId } }); if (!base) throw new NotFoundException('Preparação não encontrada.'); if (!base.isActive) throw new ConflictException('Preparação arquivada deve ser restaurada antes da edição.'); return this.prisma.recipeBase.update({ where: { id }, data: this.data(dto) }); }
  async archive(tenantId: string, id: string) { const base = await this.prisma.recipeBase.findFirst({ where: { id, tenantId } }); if (!base) throw new NotFoundException('Preparação não encontrada.'); return this.prisma.recipeBase.update({ where: { id }, data: base.isActive ? { isActive: false, archivedAt: new Date() } : {} }); }
  async restore(tenantId: string, id: string) { const base = await this.prisma.recipeBase.findFirst({ where: { id, tenantId } }); if (!base) throw new NotFoundException('Preparação não encontrada.'); return this.prisma.recipeBase.update({ where: { id }, data: base.isActive ? {} : { isActive: true, archivedAt: null } }); }
  async replaceComponents(tenantId: string, id: string, components: UpsertRecipeBaseComponentDTO[]) {
    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe-bases:${tenantId}`}, 0))`;
      const base = await tx.recipeBase.findFirst({ where: { id, tenantId }, include: { childDependencies: true } }); if (!base) throw new NotFoundException('Preparação não encontrada.'); if (!base.isActive) throw new ConflictException('Preparação arquivada deve ser restaurada antes da edição.');
      const ingredients = components.filter((x): x is Extract<UpsertRecipeBaseComponentDTO, { type: 'ingredient' }> => x.type === 'ingredient'); const children = components.filter((x): x is Extract<UpsertRecipeBaseComponentDTO, { type: 'base' }> => x.type === 'base');
      if (new Set(ingredients.map((x) => x.ingredientId)).size !== ingredients.length || new Set(children.map((x) => x.baseId)).size !== children.length) throw new BadRequestException('Componentes duplicados não são permitidos.');
      if (children.some((x) => x.baseId === id)) throw new ConflictException('A preparação não pode depender dela mesma, direta ou indiretamente.');
      const [foundIngredients, foundBases, graph] = await Promise.all([tx.ingredient.findMany({ where: { tenantId, id: { in: ingredients.map((x) => x.ingredientId) } } }), tx.recipeBase.findMany({ where: { tenantId, id: { in: children.map((x) => x.baseId) } } }), tx.recipeBaseDependency.findMany({ where: { tenantId } })]);
      if (foundIngredients.length !== ingredients.length || foundBases.length !== children.length) throw new NotFoundException('Componente não encontrado.'); if (foundBases.some((x) => !x.isActive)) throw new ConflictException('Preparação arquivada não pode ser adicionada.');
      const edges = new Map<string, string[]>(); for (const edge of graph.filter((x) => x.baseId !== id)) edges.set(edge.baseId, [...(edges.get(edge.baseId) || []), edge.componentBaseId]); edges.set(id, children.map((x) => x.baseId));
      const visit = (node: string, path = new Set<string>(), depth = 0): void => { if (depth > MAX_BASE_DEPTH) throw new ConflictException('A profundidade máxima de preparações foi excedida.'); if (path.has(node)) throw new ConflictException('A preparação não pode depender dela mesma, direta ou indiretamente.'); for (const child of edges.get(node) || []) visit(child, new Set([...path, node]), depth + 1); }; visit(id);
      await tx.recipeBaseIngredient.deleteMany({ where: { tenantId, baseId: id } }); await tx.recipeBaseDependency.deleteMany({ where: { tenantId, baseId: id } });
      if (ingredients.length) await tx.recipeBaseIngredient.createMany({ data: ingredients.map((x, index) => ({ tenantId, baseId: id, ingredientId: x.ingredientId, quantity: this.decimal(x.quantity, 'Quantidade'), sortOrder: x.sortOrder ?? index })) });
      if (children.length) await tx.recipeBaseDependency.createMany({ data: children.map((x, index) => ({ tenantId, baseId: id, componentBaseId: x.baseId, quantity: this.decimal(x.quantity, 'Quantidade'), sortOrder: x.sortOrder ?? index })) });
      return this.detail(tenantId, id);
    });
  }
}
