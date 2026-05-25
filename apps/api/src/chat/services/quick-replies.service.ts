import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from '../dto/quick-reply.dto';
import type { QuickReply } from '@prisma/client';

@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<QuickReply[]> {
    return this.prisma.quickReply.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateQuickReplyDto): Promise<QuickReply> {
    return this.prisma.quickReply.create({
      data: {
        tenantId,
        text: dto.text,
        category: dto.category,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateQuickReplyDto): Promise<QuickReply> {
    const existing = await this.prisma.quickReply.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Resposta rápida não encontrada');
    }

    return this.prisma.quickReply.update({
      where: { id },
      data: {
        text: dto.text,
        category: dto.category,
        isActive: dto.isActive,
      },
    });
  }

  async delete(tenantId: string, id: string): Promise<QuickReply> {
    const existing = await this.prisma.quickReply.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Resposta rápida não encontrada');
    }

    return this.prisma.quickReply.delete({
      where: { id },
    });
  }

  async incrementUsage(id: string): Promise<QuickReply> {
    return this.prisma.quickReply.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
      },
    });
  }
}
