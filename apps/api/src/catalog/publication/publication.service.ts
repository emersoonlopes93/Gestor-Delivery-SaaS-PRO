import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogOperationalStatus, CatalogPublicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { UpsertPublicationDto } from './dto/upsert-publication.dto';
import { CreateAvailabilityRuleDto } from './dto/create-availability-rule.dto';
import { UpdateAvailabilityRuleDto } from './dto/update-availability-rule.dto';

@Injectable()
export class PublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException('Tenant context não encontrado');
    return tenantId;
  }

  private async ensureProduct(tenantId: string, productId: string) {
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }

  private validateTimeHHmm(value: string, fieldName: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} deve estar no formato HH:MM.`);
    }
    const [hh, mm] = value.split(':').map((x) => Number(x));
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      throw new BadRequestException(`${fieldName} inválido.`);
    }
  }

  private validateDaysOfWeek(days: number[]) {
    if (!Array.isArray(days) || days.length === 0) {
      throw new BadRequestException('daysOfWeek deve conter ao menos um dia.');
    }
    for (const d of days) {
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        throw new BadRequestException('daysOfWeek inválido. Use 0-6 (domingo-sábado).');
      }
    }
  }

  async getPublication(productId: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const publication = await this.prisma.tenantClient.catalogPublication.findFirst({
      where: { tenantId, productId },
      include: { rules: { orderBy: { createdAt: 'asc' } } },
    });

    if (!publication) {
      return {
        productId,
        publicationStatus: 'draft',
        operationalStatus: 'active',
        rules: [],
      };
    }

    return publication;
  }

  async upsertPublication(productId: string, dto: UpsertPublicationDto) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const publicationStatus = dto.publicationStatus as CatalogPublicationStatus | undefined;
    const operationalStatus = dto.operationalStatus as CatalogOperationalStatus | undefined;

    if (publicationStatus === 'published' && operationalStatus === 'inactive') {
      throw new BadRequestException('Não é permitido publicar como inactive.');
    }

    return this.prisma.tenantClient.catalogPublication.upsert({
      where: { productId },
      update: {
        publicationStatus,
        operationalStatus,
      },
      create: {
        tenantId,
        productId,
        publicationStatus: publicationStatus ?? 'draft',
        operationalStatus: operationalStatus ?? 'active',
      } satisfies Prisma.CatalogPublicationUncheckedCreateInput,
      include: { rules: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async createRule(productId: string, dto: CreateAvailabilityRuleDto) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const publication = await this.prisma.tenantClient.catalogPublication.upsert({
      where: { productId },
      update: {},
      create: {
        tenantId,
        productId,
        publicationStatus: 'draft',
        operationalStatus: 'active',
      },
    });

    this.validateDaysOfWeek(dto.daysOfWeek);
    this.validateTimeHHmm(dto.startTime, 'startTime');
    this.validateTimeHHmm(dto.endTime, 'endTime');

    return this.prisma.tenantClient.catalogAvailabilityRule.create({
      data: {
        tenantId,
        publicationId: publication.id,
        channel: dto.channel,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive ?? true,
      } satisfies Prisma.CatalogAvailabilityRuleUncheckedCreateInput,
    });
  }

  async updateRule(ruleId: string, dto: UpdateAvailabilityRuleDto) {
    const tenantId = this.getRequiredTenantId();

    const rule = await this.prisma.tenantClient.catalogAvailabilityRule.findFirst({
      where: { id: ruleId, tenantId },
      select: { id: true },
    });

    if (!rule) throw new NotFoundException('Regra não encontrada.');

    if (dto.daysOfWeek) this.validateDaysOfWeek(dto.daysOfWeek);
    if (dto.startTime) this.validateTimeHHmm(dto.startTime, 'startTime');
    if (dto.endTime) this.validateTimeHHmm(dto.endTime, 'endTime');

    return this.prisma.tenantClient.catalogAvailabilityRule.update({
      where: { id: ruleId },
      data: {
        channel: dto.channel,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive,
      },
    });
  }

  async deleteRule(ruleId: string) {
    const tenantId = this.getRequiredTenantId();

    const rule = await this.prisma.tenantClient.catalogAvailabilityRule.findFirst({
      where: { id: ruleId, tenantId },
      select: { id: true },
    });

    if (!rule) throw new NotFoundException('Regra não encontrada.');

    return this.prisma.tenantClient.catalogAvailabilityRule.delete({
      where: { id: ruleId },
    });
  }

  async listRules(productId: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureProduct(tenantId, productId);

    const publication = await this.prisma.tenantClient.catalogPublication.findFirst({
      where: { tenantId, productId },
      select: { id: true },
    });

    if (!publication) return [];

    return this.prisma.tenantClient.catalogAvailabilityRule.findMany({
      where: { tenantId, publicationId: publication.id },
      orderBy: { createdAt: 'asc' },
    });
  }
}
