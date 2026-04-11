import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateIngredientDTO, UpdateIngredientDTO, IngredientDTO } from '@gestor/types';

@Injectable()
export class IngredientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<IngredientDTO[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return ingredients.map(ing => this.mapToDTO(ing));
  }

  async findOne(tenantId: string, id: string): Promise<IngredientDTO> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, tenantId },
    });

    if (!ingredient) {
      throw new NotFoundException('Insumo não encontrado');
    }

    return this.mapToDTO(ingredient);
  }

  async create(tenantId: string, dto: CreateIngredientDTO): Promise<IngredientDTO> {
    if (dto.sku) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { tenantId, sku: dto.sku },
      });

      if (existing) {
        throw new ConflictException('Insumo com este SKU já existe');
      }
    }

    const ingredient = await this.prisma.ingredient.create({
      data: {
        ...dto,
        tenantId,
      },
    });

    return this.mapToDTO(ingredient);
  }

  async update(tenantId: string, id: string, dto: UpdateIngredientDTO): Promise<IngredientDTO> {
    const ingredient = await this.findOne(tenantId, id);

    if (dto.sku && dto.sku !== ingredient.sku) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { tenantId, sku: dto.sku },
      });

      if (existing) {
        throw new ConflictException('Insumo com este SKU já existe');
      }
    }

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: dto,
    });

    return this.mapToDTO(updated);
  }

  private mapToDTO(ing: any): IngredientDTO {
    return {
      ...ing,
      currentCost: Number(ing.currentCost),
      currentStock: Number(ing.currentStock),
      minStock: ing.minStock ? Number(ing.minStock) : undefined,
    };
  }
}
