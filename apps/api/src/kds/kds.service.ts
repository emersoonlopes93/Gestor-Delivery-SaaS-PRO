import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
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
    product?: { category?: { name: string; templateConfig?: Prisma.JsonValue } | null } | null
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
  private readonly logger = new Logger(KdsService.name);
  private readonly activeJobsCreations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly printerService: PrinterService,
  ) {}

  private buildIdempotencyKey(prefix: string, parts: Array<string | number | null | undefined>) {
    const normalized = parts
      .map((part) => (part === null || part === undefined ? '' : String(part).trim()))
      .join('|');
    return `${prefix}_${createHash('sha1').update(normalized).digest('hex')}`;
  }

  private async createOrReusePrintJob(data: Prisma.PrintJobUncheckedCreateInput & { idempotencyKey?: string | null }) {
    if (!data.idempotencyKey) {
      return this.prisma.printJob.create({ data });
    }

    return this.prisma.printJob.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      create: data,
      update: {},
    });
  }

  private async assertOrderBelongsToTenant(orderId: string, tenantId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
  }

  /**
   * Obtém as estações ativas de forma dinâmica (categorias e jobs pendentes)
   */
  async getAvailableStations(): Promise<string[]> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return ['GERAL'];

    const stations = new Set<string>();
    stations.add('GERAL');

    try {
      const categories = await this.prisma.productCategory.findMany({
        where: { tenantId },
        select: { name: true, templateConfig: true }
      });

      for (const cat of categories) {
        if (cat.templateConfig && typeof cat.templateConfig === 'object' && !Array.isArray(cat.templateConfig)) {
          const config = cat.templateConfig as Record<string, unknown>;
          if (typeof config.station === 'string' && config.station.trim()) {
            stations.add(config.station as string);
          }
        }
      }

      const pendingJobs = await this.prisma.printJob.groupBy({
        by: ['station'],
        where: {
          tenantId,
          status: {
            notIn: [PrismaPrintJobStatus.completed]
          }
        }
      });

      for (const job of pendingJobs) {
        if (job.station) {
          stations.add(job.station);
        }
      }
    } catch (e) {
      this.logger.error('Error fetching dynamic stations:', e);
    }

    return Array.from(stations).sort();
  }

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
      station: station && station !== 'ALL' ? station : undefined,
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
   * Retrieves a single print job while preserving tenant isolation.
   */
  async getPrintJob(printJobId: string): Promise<PrintJobWithOrder> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const printJob = await this.prisma.printJob.findFirst({
      where: { id: printJobId, tenantId },
      include: {
        order: {
          include: {
            items: true,
            customer: true,
          },
        },
      },
    });

    if (!printJob) {
      throw new NotFoundException('Print job not found');
    }

    return printJob;
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

    await this.assertOrderBelongsToTenant(data.orderId, tenantId);

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
  async cleanupOldJobs(tenantId: string, days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);

    return this.prisma.printJob.deleteMany({
      where: {
        tenantId,
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
  async createProductionJobs(orderId: string, explicitTenantId?: string) {
    const tenantId = explicitTenantId || this.tenantContext.getTenantId();
    if (!tenantId) {
      this.logger.warn(`createProductionJobs: tenantId is undefined for orderId ${orderId}. Job not created.`);
      return [];
    }

    // Early check: only active jobs should block new production tickets.
    // Completed/failed jobs are historical and must not hide a new send-to-production action.
    const existingActiveJobsCount = await this.prisma.printJob.count({
      where: {
        tenantId,
        orderId,
        status: { in: [PrismaPrintJobStatus.pending, PrismaPrintJobStatus.printing] },
      },
    });
    if (existingActiveJobsCount > 0) {
      this.logger.debug(`createProductionJobs: Active jobs already exist for order ${orderId}`);
      return [];
    }

    const lockKey = `${tenantId}:${orderId}`;
    if (this.activeJobsCreations.has(lockKey)) {
      this.logger.log(`createProductionJobs: Job creation already in progress for order ${orderId}`);
      return [];
    }

    this.activeJobsCreations.add(lockKey);

    try {
      // Double-check: confirm jobs still don't exist (in case another thread created them while we were acquiring the lock)
      const finalCheckActiveJobs = await this.prisma.printJob.count({
        where: {
          tenantId,
          orderId,
          status: { in: [PrismaPrintJobStatus.pending, PrismaPrintJobStatus.printing] },
        },
      });
      if (finalCheckActiveJobs > 0) {
        this.logger.debug(`createProductionJobs: Active jobs were created by another thread for order ${orderId}`);
        return [];
      }


      const order = await this.prisma.order.findUnique({
        where: { id: orderId, tenantId },
        include: {
          deliveryAddress: true,
          items: {
            include: {
              product: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        this.logger.warn(`createProductionJobs: order ${orderId} not found for tenant ${tenantId}.`);
        return [];
      }

      // Agrupar itens por estação
      const mapItemsToTicket = (items: OrderWithItems['items']) => items.map(item => {
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
          snapshotCatalogV2Json: orderItem.snapshotCatalogV2Json,
        };
      });

      const jobs = [];
      const primaryPrinter = await this.prisma.printerDevice.findFirst({
        where: {
          tenantId,
          isPrimary: true,
          isActive: true,
          autoPrintEnabled: true,
        },
        select: { id: true },
      });

      if (primaryPrinter) {
        const orderWithAddress = order as OrderWithItems & { deliveryAddress?: OrderResponseDTO['deliveryAddress'] };
        const mainReceiptOrder: OrderResponseDTO = {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status as OrderStatus,
          fulfillmentType: order.fulfillmentType as FulfillmentType,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail,
          deliveryAddress: orderWithAddress.deliveryAddress ?? null,
          tableNumber: order.tableNumber,
          notes: order.notes,
          items: mapItemsToTicket((order as OrderWithItems).items),
          total: Number(order.total),
          itemsSubtotal: Number(order.itemsSubtotal),
          discountTotal: Number(order.discountTotal),
          deliveryFee: Number(order.deliveryFee),
          serviceFee: Number(order.serviceFee),
          sourceChannel: order.sourceChannel,
          paymentMethod: (order.paymentMethod || 'cash') as PaymentMethod,
          changeFor: order.changeFor ? Number(order.changeFor) : null,
          timeline: [],
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        };
        const content = await this.printerService.formatTicket(mainReceiptOrder, 'customer');

        jobs.push(this.createOrReusePrintJob({
          tenantId,
          orderId,
          station: 'MAIN',
          type: PrismaPrintType.customer,
          content,
          idempotencyKey: `auto_print_${orderId}_${PrismaPrintType.customer}_MAIN`,
          status: PrismaPrintJobStatus.pending,
        }));
      }

      const stationGroups: Record<string, OrderItem[]> = {};
      
      for (const item of (order as OrderWithItems).items) {
        const category = item.product?.category;
        let station = 'GERAL';
        
        if (category && category.templateConfig && typeof category.templateConfig === 'object' && !Array.isArray(category.templateConfig)) {
          const config = category.templateConfig as Record<string, unknown>;
          station = typeof config.station === 'string' && config.station.trim()
            ? config.station
            : 'GERAL';
        }
        
        if (!stationGroups[station]) stationGroups[station] = [];
        stationGroups[station].push(item);
      }

      if (Object.keys(stationGroups).length === 0) {
        this.logger.warn(`createProductionJobs: order ${orderId} has no items. No KDS jobs created.`);
        return [];
      }

      // Para cada estação, criar um job
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
            snapshotCatalogV2Json: orderItem.snapshotCatalogV2Json,

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

        const content = await this.printerService.formatTicket(pseudoOrder, 'kitchen', station);

        jobs.push(this.createOrReusePrintJob({
          tenantId,
          orderId,
          station,
          type: PrismaPrintType.kitchen,
          content,
          idempotencyKey: `auto_print_${orderId}_${PrismaPrintType.kitchen}_${station}`,
          status: PrismaPrintJobStatus.pending,
        }));
      }

      return await Promise.all(jobs);
    } finally {
      this.activeJobsCreations.delete(lockKey);
    }
  }
  /**
   * Cria jobs incrementais (ex: quando um item é adicionado a uma mesa)
   */
  async createIncrementalPrintJob(data: { orderId: string; station: string; content: string }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return;

    await this.assertOrderBelongsToTenant(data.orderId, tenantId);

    return this.createOrReusePrintJob({
      tenantId,
      orderId: data.orderId,
      station: data.station,
      type: PrismaPrintType.kitchen,
      content: data.content,
      status: PrismaPrintJobStatus.pending,
      idempotencyKey: this.buildIdempotencyKey('incremental_print', [tenantId, data.orderId, data.station, data.content]),
    });
  }

  /**
   * Cria jobs incrementais para vários itens de uma vez
   */
  async createIncrementalPrintJobsForOrder(data: { orderId: string; station: string; items: { content: string }[] }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return;

    await this.assertOrderBelongsToTenant(data.orderId, tenantId);

    const jobs = data.items.map((item) => this.createOrReusePrintJob({
      tenantId,
      orderId: data.orderId,
      station: data.station,
      type: PrismaPrintType.kitchen,
      content: item.content,
      status: PrismaPrintJobStatus.pending,
      idempotencyKey: this.buildIdempotencyKey('incremental_print', [tenantId, data.orderId, data.station, item.content]),
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
