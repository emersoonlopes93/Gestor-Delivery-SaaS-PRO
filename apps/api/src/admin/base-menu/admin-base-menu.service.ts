import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminBaseMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const templates = await this.prisma.baseMenuTemplate.findMany({
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: { products: true },
            },
          },
        },
        versions: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            createdAt: true,
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return templates.map((template) => {
      const categories = template.currentPublishedVersion?.categories ?? [];
      return {
        id: template.id,
        slug: template.slug,
        name: template.name,
        description: template.description,
        segment: template.segment,
        icon: template.icon,
        status: template.status,
        currentPublishedVersionId: template.currentPublishedVersionId,
        totalCategories: categories.length,
        totalProducts: categories.reduce((sum, category) => sum + category.products.length, 0),
        versions: template.versions,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };
    });
  }

  async get(idOrSlug: string) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: {
                products: {
                  orderBy: { sortOrder: 'asc' },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    return template;
  }

  async listVersions(idOrSlug: string) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    return this.prisma.baseMenuTemplateVersion.findMany({
      where: { templateId: template.id },
      orderBy: { versionNumber: 'desc' },
    });
  }
}
