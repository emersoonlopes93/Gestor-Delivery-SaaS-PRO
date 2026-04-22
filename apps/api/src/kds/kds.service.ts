import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PrintJobStatus, PrintType } from '@prisma/client';

@Injectable()
export class KdsService {
  private readonly logger = new Logger(KdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
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
        { priority: 'desc' },
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
          { priority: 'desc' },
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
  async markAsFailed(printJobId: string, error?: string) {
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

    const shouldRetry = printJob.tries < printJob.maxTries;

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
   * Cria um job de impressão incremental
   */
  async createPrintJob(data: {
    orderId: string;
    station: string;
    content: string;
    printerName?: string;
    copies?: number;
    priority?: number;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    // Validar pedido
    const order = await this.prisma.order.findFirst({
      where: {
        id: data.orderId,
        tenantId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.prisma.printJob.create({
      data: {
        tenantId,
        orderId: data.orderId,
        station: data.station,
        type: PrintType.kitchen, // Default para KDS
        content: data.content,
        status: PrintJobStatus.pending,
      },
      include: {
        order: true,
      },
    });
  }

  async createIncrementalPrintJob(data: {
    orderId: string;
    station: string;
    sequenceNumber: number;
    parentPrintJobId?: string;
    content: string;
    metadata?: any;
    priority?: number;
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
        type: PrintType.incremental,
        content: data.content,
        status: PrintJobStatus.pending,
      },
      include: {
        order: true,
      },
    });
  }

  /**
   * Cria múltiplos jobs de impressão incremental para um pedido
   */
  async createIncrementalPrintJobsForOrder(data: {
    orderId: string;
    station: string;
    items: Array<{
      sequenceNumber: number;
      content: string;
      metadata?: any;
    }>;
    parentPrintJobId?: string;
    priority?: number;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    // Validar pedido
    const order = await this.prisma.order.findFirst({
      where: {
        id: data.orderId,
        tenantId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Criar jobs em lote
    const printJobs = await this.prisma.$transaction(async (tx) => {
      const jobs = [];
      
      for (const item of data.items) {
        const job = await tx.printJob.create({
          data: {
            tenantId,
            orderId: data.orderId,
            station: data.station,
            type: PrintType.incremental,
            content: item.content,
            metadata: item.metadata as any,
            priority: data.priority || 0,
            isIncremental: true,
            sequenceNumber: item.sequenceNumber,
            parentPrintJobId: data.parentPrintJobId,
            status: PrintJobStatus.pending,
          },
        });
        
        jobs.push(job);
      }
      
      return jobs;
    });

    this.logger.log(`Created ${printJobs.length} incremental print jobs for order ${data.orderId}`);
    
    return printJobs;
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

    const printing = await this.prisma.printJob.count({
      where: {
        tenantId,
        station: station,
        status: PrintJobStatus.printing,
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

    const total = pending + printing + completed + failed;

    return {
      total,
      pending,
      printing,
      completed,
      failed,
    };
  }

  /**
   * Limpa jobs antigos (manutenção)
   */
  async cleanupOldPrintJobs(daysOld = 7) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.printJob.deleteMany({
      where: {
        tenantId,
        status: {
          in: [PrintJobStatus.completed, PrintJobStatus.failed],
        },
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old print jobs older than ${daysOld} days`);
    
    return result;
  }

  /**
   * Obtém jobs de impressão agrupados por pedido
   */
  async getGroupedPrintJobs(orderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const printJobs = await this.prisma.printJob.findMany({
      where: {
        tenantId,
        orderId,
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
    });

    return {
      printJobs,
      total: printJobs.length,
    };
  }
}
