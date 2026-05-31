import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { 
  Prisma, 
  Order, 
  OrderItem, 
  PrintJob, 
  Customer,
  PrintJobStatus as PrismaPrintJobStatus,
  PrintType as PrismaPrintType
} from '@prisma/client';
import { PrinterService } from '../pos/printer.service';
import { 
  OrderResponseDTO, 
  PrintType, 
  PrintJobStatus,
  OrderStatus,
  FulfillmentType,
  PaymentMethod
} from '@gestor/types';

type OrderWithItems = Order & { 
  items: Array<OrderItem & { 
    product?: { category?: { name: string; templateConfig?: Prisma.JsonValue } | null } | null,
    complements?: Array<{ id: string, complementItemId: string, snapshotName: string, snapshotPrice: Prisma.Decimal }>,
    comboSelections?: Array<{ id: string, comboBlockItemId: string, snapshotBlockName: string, snapshotProductName: string, snapshotAdditionalPrice: Prisma.Decimal }>
  }>;
};

type PrintJobWithOrder = PrintJob & {
  order: Order & {
    items: OrderItem[];
    customer: Customer | null;
  };
};

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly printerService: PrinterService,
  ) {}

  /**
   * Busca jobs de impressão pendentes de uma estação
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
        status: PrismaPrintJobStatus.pending,
      },
      orderBy: {
        createdAt: 'asc',
      },
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
   * Busca o próximo job de impressão para o spooler local
   */
  async getNextPrintJobForSpooler(station: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const job = await this.prisma.printJob.findFirst({
      where: {
        tenantId,
        station,
        status: PrismaPrintJobStatus.pending,
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
    });

    if (!job) return null;

    // Marca como imprimindo para evitar duplicidade
    return this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrismaPrintJobStatus.printing,
        lastTriedAt: new Date(),
        tries: {
          increment: 1,
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
  ): Promise<{ items: PrintJobWithOrder[]; total: number; page: number; limit: number }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const skip = (page - 1) * limit;

    const where: Prisma.PrintJobWhereInput = {
      tenantId,
      station: station || undefined,
    };

    if (status) {
      where.status = mapPrintJobStatus(status);
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

    // Usando cast seguro via narrowing estrutural se necessário, mas aqui o Prisma já retorna o formato esperado
    // pelo tipo PrintJobWithOrder definido localmente.
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

    if (printJob.status !== PrismaPrintJobStatus.pending) {
      throw new BadRequestException('Print job is not in pending status');
    }

    return this.prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: PrismaPrintJobStatus.printing,
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

    return this.prisma.printJob.update({
      where: { id: printJobId, tenantId },
      data: {
        status: PrismaPrintJobStatus.completed,
        printedAt: new Date(),
      },
    });
  }

  /**
   * Marca um job de impressão como falho
   */
  async markAsFailed(printJobId: string, _error?: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const job = await this.prisma.printJob.findUnique({
      where: { id: printJobId, tenantId },
    });

    if (!job) throw new NotFoundException('Job not found');

    const shouldRetry = job.tries < 3;

    return this.prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: shouldRetry ? PrismaPrintJobStatus.pending : PrismaPrintJobStatus.failed,
      },
    });
  }

  /**
   * Cria um job de impressão manual/genérico
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

    const printJob = await this.prisma.printJob.create({
      data: {
        tenantId,
        orderId: data.orderId,
        station: data.station || 'GERAL',
        type: mapPrintType(data.type || PrintType.kitchen),
        content: data.content,
        status: PrismaPrintJobStatus.pending,
      },
      include: {
        order: true,
      },
    });

    return printJob;
  }

  /**
   * Busca jobs agrupados por pedido
   */
  async getGroupedPrintJobs(orderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.printJob.findMany({
      where: { tenantId, orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Estatísticas de impressão por estação
   */
  async getStationStats(station: string) {
    const tenantId = this.tenantContext.getTenantId();
    
    const [pending, completed, failed] = await Promise.all([
      this.prisma.printJob.count({ where: { tenantId, station, status: PrismaPrintJobStatus.pending } }),
      this.prisma.printJob.count({ where: { tenantId, station, status: PrismaPrintJobStatus.completed } }),
      this.prisma.printJob.count({ where: { tenantId, station, status: PrismaPrintJobStatus.failed } }),
    ]);

    return {
      pending,
      completed,
      failed,
      total: pending + completed + failed,
    };
  }

  /**
   * Cancela todos os jobs pendentes de uma estação ou pedido
   */
  async cancelPrintJobs(filters: { station?: string; orderId?: string }) {
    const tenantId = this.tenantContext.getTenantId();
    
    // Como não existe 'cancelled' no enum, removemos os pendentes ou mantemos como falhos?
    // Vamos apenas deletar ou deixar como falhos. O schema atual não tem 'cancelled'.
    return this.prisma.printJob.deleteMany({
      where: {
        tenantId,
        station: filters.station,
        orderId: filters.orderId,
        status: PrismaPrintJobStatus.pending,
      },
    });
  }

  /**
   * Re-enfileira um job para impressão
   */
  async retryPrintJob(printJobId: string) {
    const tenantId = this.tenantContext.getTenantId();
    
    return this.prisma.printJob.update({
      where: { id: printJobId, tenantId },
      data: {
        status: PrismaPrintJobStatus.pending,
        tries: 0,
      },
    });
  }

  /**
   * Limpa jobs antigos (manutenção)
   */
  async cleanupOldJobs(days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);

    return this.prisma.printJob.deleteMany({
      where: {
        createdAt: { lt: date },
        status: {
          in: [PrismaPrintJobStatus.completed, PrismaPrintJobStatus.failed],
        },
      },
    });
  }

  /**
   * Cria os jobs de produção na cozinha baseado no pedido
   */
  async createProductionJobs(orderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return [];

    const existingJobs = await this.prisma.printJob.count({
      where: { tenantId, orderId },
    });
    if (existingJobs > 0) {
      return [];
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
            complements: true,
            comboSelections: true,
          },
        },
      },
    });

    if (!order) return;

    // Agrupar itens por estação
    const stationGroups: Record<string, OrderItem[]> = {};
    
    for (const item of (order as OrderWithItems).items) {
      const category = item.product?.category;
      let station = 'GERAL';
      
      if (category && category.templateConfig && typeof category.templateConfig === 'object' && !Array.isArray(category.templateConfig)) {
        const config = category.templateConfig as Record<string, unknown>;
        station = (config.station as string) || category.name;
      } else if (category) {
        station = category.name;
      }
      
      if (!stationGroups[station]) stationGroups[station] = [];
      stationGroups[station].push(item);
    }

    // Para cada estação, criar um job
    const jobs = [];
    for (const [station, items] of Object.entries(stationGroups)) {
      // Map OrderItem and its relations to OrderItemResponseDTO
      const mappedItems = items.map(item => {
        const orderItem = item as OrderWithItems['items'][number];
 
        return {
          id: orderItem.id,
          lineType: orderItem.lineType as 'product' | 'combo',
          productId: orderItem.productId,
          comboId: orderItem.comboId,
          quantity: orderItem.quantity,
          unitPrice: Number(orderItem.unitPrice),
          lineTotal: Number(orderItem.lineTotal),
          notes: orderItem.notes,
          snapshotName: orderItem.snapshotName,
          snapshotImage: orderItem.snapshotImage,
          snapshotBasePrice: Number(orderItem.snapshotBasePrice),
          snapshotExtrasTotal: Number(orderItem.snapshotExtrasTotal),
          snapshotComposition: orderItem.snapshotComposition,
          complements: (orderItem.complements || []).map(c => ({
            id: c.id,
            complementItemId: c.complementItemId,
            snapshotName: c.snapshotName,
            snapshotPrice: Number(c.snapshotPrice),
          })),
          comboSelections: (orderItem.comboSelections || []).map(s => ({
            id: s.id,
            comboBlockItemId: s.comboBlockItemId,
            snapshotBlockName: s.snapshotBlockName,
            snapshotProductName: s.snapshotProductName,
            snapshotAdditionalPrice: Number(s.snapshotAdditionalPrice),
          })),
        };
      });

      const pseudoOrder: OrderResponseDTO = {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status as OrderStatus,
        fulfillmentType: order.fulfillmentType as FulfillmentType,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        items: mappedItems,
        total: Number(order.total),
        itemsSubtotal: Number(order.itemsSubtotal),
        discountTotal: Number(order.discountTotal),
        deliveryFee: Number(order.deliveryFee),
        serviceFee: Number(order.serviceFee),
        sourceChannel: order.sourceChannel,
        paymentMethod: order.paymentMethod as PaymentMethod,
        timeline: [],
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };

      const content = await this.printerService.formatTicket(pseudoOrder, PrintType.kitchen, station);

      jobs.push(this.prisma.printJob.create({
        data: {
          tenantId,
          orderId,
          station,
          type: PrismaPrintType.kitchen,
          content,
          status: PrismaPrintJobStatus.pending,
        },
      }));
    }

    return Promise.all(jobs);
  }

  /**
   * Cria jobs incrementais (ex: quando um item é adicionado a uma mesa)
   */
  async createIncrementalPrintJob(data: { orderId: string; station: string; content: string }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return;

    return this.prisma.printJob.create({
      data: {
        tenantId,
        orderId: data.orderId,
        station: data.station,
        type: PrismaPrintType.kitchen,
        content: data.content,
        status: PrismaPrintJobStatus.pending,
      },
    });
  }

  /**
   * Cria jobs incrementais para vários itens de uma vez
   */
  async createIncrementalPrintJobsForOrder(data: { orderId: string; station: string; items: { content: string }[] }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return;

    const jobs = data.items.map(item => this.prisma.printJob.create({
      data: {
        tenantId,
        orderId: data.orderId,
        station: data.station,
        type: PrismaPrintType.kitchen,
        content: item.content,
        status: PrismaPrintJobStatus.pending,
      },
    }));

    return Promise.all(jobs);
  }
}

function mapPrintJobStatus(status: PrintJobStatus): PrismaPrintJobStatus {
  const mapping: Record<PrintJobStatus, PrismaPrintJobStatus> = {
    [PrintJobStatus.pending]: PrismaPrintJobStatus.pending,
    [PrintJobStatus.printing]: PrismaPrintJobStatus.printing,
    [PrintJobStatus.completed]: PrismaPrintJobStatus.completed,
    [PrintJobStatus.failed]: PrismaPrintJobStatus.failed,
  };
  return mapping[status];
}

function mapPrintType(type: PrintType): PrismaPrintType {
  const mapping: Record<PrintType, PrismaPrintType> = {
    [PrintType.kitchen]: PrismaPrintType.kitchen,
    [PrintType.customer]: PrismaPrintType.customer,
    [PrintType.summary]: PrismaPrintType.summary,
  };
  return mapping[type];
}
