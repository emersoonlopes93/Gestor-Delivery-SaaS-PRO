import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PrintJobStatus, PrintType } from '@prisma/client';
import { PrinterService } from '../pos/printer.service';

@Injectable()
export class KdsService {
  private readonly logger = new Logger(KdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly printerService: PrinterService,
  ) {}

  /**
   * Lista jobs de impressão pendentes para uma estação específica
   */
  async getPendingPrintJobs(station: string, limit = 50) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    return this.prisma.printJob.findMany({
      where: {
        tenantId,
        station,
        status: PrintJobStatus.pending,
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
      take: limit,
      include: {
        order: {
          include: {
            items: true,
            customer: true,
          },
        },
      },
    });
  }

  /**
   * Busca o próximo job pendente para o spooler, marcando-o como 'printing' atomicamente.
   */
  async getNextPrintJobForSpooler(station: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    return this.prisma.$transaction(async (tx) => {
      // Usando queryRaw para garantir lock atômico no PostgreSQL (SKIP LOCKED evita espera entre workers)
      const jobs = await tx.$queryRaw<any[]>`
        SELECT id FROM print_jobs 
        WHERE tenant_id = ${tenantId} 
          AND station = ${station} 
          AND status = 'pending' 
        ORDER BY created_at ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      `;

      if (!jobs || jobs.length === 0) return null;

      return tx.printJob.update({
        where: { id: jobs[0].id },
        data: {
          status: PrintJobStatus.printing,
          lastTriedAt: new Date(),
          tries: { increment: 1 },
        },
      });
    });
  }

  /**
   * Lista todos os jobs de impressão de uma estação
   */
  async getAllPrintJobs(
    station: string,
    status?: PrintJobStatus,
    page = 1,
    limit = 20,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      station,
    };

    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where,
        orderBy: [
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          order: {
            include: {
              items: true,
              customer: true,
            },
          },
        },
      }),
      this.prisma.printJob.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Marca um job de impressão como em processo
   */
  async markAsPrinting(printJobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const printJob = await this.prisma.printJob.findFirst({
      where: {
        id: printJobId,
        tenantId,
      },
    });

    if (!printJob) {
      throw new NotFoundException('Print job not found');
    }

    if (printJob.status !== PrintJobStatus.pending) {
      throw new BadRequestException('Print job is not in pending status');
    }

    return this.prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: PrintJobStatus.printing,
        lastTriedAt: new Date(),
        tries: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Marca um job de impressão como concluído
   */
  async markAsCompleted(printJobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const printJob = await this.prisma.printJob.findFirst({
      where: {
        id: printJobId,
        tenantId,
      },
    });

    if (!printJob) {
      throw new NotFoundException('Print job not found');
    }

    return this.prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: PrintJobStatus.completed,
        printedAt: new Date(),
      },
    });
  }

  /**
   * Marca um job de impressão como falhado
   */
  async markAsFailed(printJobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const printJob = await this.prisma.printJob.findFirst({
      where: {
        id: printJobId,
        tenantId,
      },
    });

    if (!printJob) {
      throw new NotFoundException('Print job not found');
    }

    const shouldRetry = printJob.tries < 3;

    return this.prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: shouldRetry ? PrintJobStatus.pending : PrintJobStatus.failed,
        lastTriedAt: new Date(),
        tries: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Cria um job de impressão
   */
  async createPrintJob(data: {
    orderId: string;
    station: string;
    content: string;
    type?: PrintType;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    return this.prisma.printJob.create({
      data: {
        tenantId,
        orderId: data.orderId,
        station: data.station,
        type: data.type || PrintType.kitchen,
        content: data.content,
        status: PrintJobStatus.pending,
      },
      include: {
        order: true,
      },
    });
  }

  /**
   * Reimprime um job de impressão
   */
  async reprintPrintJob(printJobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const originalJob = await this.prisma.printJob.findFirst({
      where: {
        id: printJobId,
        tenantId,
      },
    });

    if (!originalJob) {
      throw new NotFoundException('Print job not found');
    }

    // Criar cópia do job original
    const newJob = await this.prisma.printJob.create({
      data: {
        tenantId,
        orderId: originalJob.orderId,
        station: originalJob.station,
        type: originalJob.type,
        content: originalJob.content,
        status: PrintJobStatus.pending,
      },
    });

    this.logger.log(`Recreated print job ${newJob.id} from original ${printJobId}`);
    
    return newJob;
  }

  /**
   * Cancela um job de impressão
   */
  async cancelPrintJob(printJobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const printJob = await this.prisma.printJob.findFirst({
      where: {
        id: printJobId,
        tenantId,
      },
    });

    if (!printJob) {
      throw new NotFoundException('Print job not found');
    }

    return this.prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: PrintJobStatus.failed,
      },
    });
  }

  /**
   * Obtém estatísticas da estação
   */
  async getStationStats(station: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const pending = await this.prisma.printJob.count({
      where: {
        tenantId,
        station: station,
        status: PrintJobStatus.pending,
      },
    });

    const completed = await this.prisma.printJob.count({
      where: {
        tenantId,
        station: station,
        status: PrintJobStatus.completed,
      },
    });

    const failed = await this.prisma.printJob.count({
      where: {
        tenantId,
        station: station,
        status: PrintJobStatus.failed,
      },
    });

    return {
      total: pending + completed + failed,
      pending,
      completed,
      failed,
    };
  }

  /**
   * Cria jobs de produção para todas as estações envolvidas no pedido
   */
  async createProductionJobs(orderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true
              }
            },
            complements: true
          }
        },
        customer: true
      }
    });

    if (!order) throw new NotFoundException('Order not found');

    // Agrupar itens por estação
    const stationGroups: Record<string, any[]> = {};
    
    for (const item of order.items) {
      const category = item.product?.category;
      let station = 'GERAL';
      
      if (category) {
        const config = category.templateConfig as any;
        station = config?.station || category.name;
      }
      
      if (!stationGroups[station]) stationGroups[station] = [];
      stationGroups[station].push(item);
    }

    // Para cada estação, criar um job
    const jobs = [];
    for (const [station, items] of Object.entries(stationGroups)) {
      const pseudoOrder = {
        ...order,
        items: items as any,
        total: Number(order.total),
        itemsSubtotal: Number(order.itemsSubtotal),
        discountTotal: Number(order.discountTotal),
        deliveryFee: Number(order.deliveryFee),
        serviceFee: Number(order.serviceFee),
      } as any;

      const content = await this.printerService.formatTicket(pseudoOrder, 'kitchen', station);

      const job = await this.prisma.printJob.create({
        data: {
          tenantId,
          orderId,
          station,
          type: PrintType.kitchen,
          content,
          status: PrintJobStatus.pending,
        }
      });
      jobs.push(job);
    }

    this.logger.log(`Created ${jobs.length} production print jobs for order ${orderId}`);
    return jobs;
  }

  /**
   * Obtém jobs agrupados por pedido
   */
  async getGroupedPrintJobs(orderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.printJob.findMany({
      where: {
        tenantId: tenantId!,
        orderId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Cria um job de impressão incremental (legado/compatibilidade)
   */
  async createIncrementalPrintJob(data: any) {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.printJob.create({
      data: {
        tenantId: tenantId!,
        orderId: data.orderId,
        station: data.station,
        type: PrintType.kitchen,
        content: data.content,
        status: PrintJobStatus.pending,
      }
    });
  }

  /**
   * Cria múltiplos jobs incrementais (legado/compatibilidade)
   */
  async createIncrementalPrintJobsForOrder(data: any) {
    const tenantId = this.tenantContext.getTenantId();
    const results = [];
    for (const item of data.items) {
      const job = await this.prisma.printJob.create({
        data: {
          tenantId: tenantId!,
          orderId: data.orderId,
          station: data.station,
          type: PrintType.kitchen,
          content: item.content,
          status: PrintJobStatus.pending,
        }
      });
      results.push(job);
    }
    return results;
  }

  /**
   * Limpa jobs de impressão antigos
   */
  async cleanupOldPrintJobs(daysOld = 7) {
    const tenantId = this.tenantContext.getTenantId();
    const date = new Date();
    date.setDate(date.getDate() - daysOld);

    const result = await this.prisma.printJob.deleteMany({
      where: {
        tenantId: tenantId!,
        createdAt: {
          lt: date,
        },
        status: {
          in: [PrintJobStatus.completed, PrintJobStatus.failed],
        },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old print jobs for tenant ${tenantId}`);
    return result;
  }
}
