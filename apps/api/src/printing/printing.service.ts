import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma, PrintJobStatus, PrintType } from '@prisma/client';
import { PrinterService as LegacyPrinterService } from '../pos/printer.service';
import { slugify } from '@gestor/utils';
import type { OrderResponseDTO } from '@gestor/types';
import { randomUUID } from 'crypto';

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly legacyPrinter: LegacyPrinterService,
  ) {}

  private async assertStationBelongsToTenant(tenantId: string, stationId?: string | null) {
    if (!stationId) return;

    const station = await this.db.printStation.findFirst({
      where: { id: stationId, tenantId },
      select: { id: true },
    });

    if (!station) {
      throw new BadRequestException('Print station does not belong to the active tenant');
    }
  }

  private async assertDeviceBelongsToTenant(tenantId: string, deviceId: string) {
    const device = await this.db.printerDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }
  }

  private async createOrReusePrintJob(data: Prisma.PrintJobUncheckedCreateInput & { idempotencyKey?: string | null }) {
    if (!data.idempotencyKey) {
      return this.db.printJob.create({ data });
    }

    return this.db.printJob.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      create: data,
      update: {},
    });
  }

  async getJobs(tenantId: string) {
    return this.db.printJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getStations(tenantId: string) {
    const stations = await this.ensurePrintStationsForTenant(tenantId);
    const jobGroups = await this.db.printJob.groupBy({
      by: ['station', 'status'],
      where: {
        tenantId,
        type: PrintType.kitchen,
        status: { in: [PrintJobStatus.pending, PrintJobStatus.printing, PrintJobStatus.failed] },
      },
      _count: { _all: true },
    });

    return stations.map((station) => {
      const stationKeys = new Set([station.name, station.slug].map((value) => value.trim().toLocaleLowerCase('pt-BR')));
      const kdsJobSummary = { pending: 0, printing: 0, failed: 0 };

      for (const group of jobGroups) {
        if (!stationKeys.has(group.station.trim().toLocaleLowerCase('pt-BR'))) continue;
        if (group.status === PrintJobStatus.pending) kdsJobSummary.pending += group._count._all;
        if (group.status === PrintJobStatus.printing) kdsJobSummary.printing += group._count._all;
        if (group.status === PrintJobStatus.failed) kdsJobSummary.failed += group._count._all;
      }

      return { ...station, kdsJobSummary };
    });
  }

  async updateStationActive(tenantId: string, stationId: string, isActive: boolean) {
    const currentStation = await this.db.printStation.findFirst({
      where: { id: stationId, tenantId },
      select: { id: true },
    });

    if (!currentStation) throw new NotFoundException('Print station not found');

    const updated = await this.db.printStation.updateMany({
      where: { id: stationId, tenantId },
      data: { isActive },
    });

    if (updated.count !== 1) throw new NotFoundException('Print station not found');

    const station = await this.db.printStation.findFirst({
      where: { id: stationId, tenantId },
      include: { devices: true },
    });

    if (!station) throw new NotFoundException('Print station not found');
    return station;
  }

  async ensurePrintStationsForTenant(tenantId: string) {
    const stationCandidates = await this.getKdsStationCandidates(tenantId);
    const candidates = stationCandidates.length > 0
      ? stationCandidates
      : [{ name: 'Geral / Balcão', slug: 'general' }];

    for (const candidate of candidates) {
      const existingStation = await this.db.printStation.findFirst({
        where: {
          tenantId,
          slug: candidate.slug,
        },
        select: {
          id: true,
        },
      });

      if (!existingStation) {
        await this.db.printStation.create({
          data: {
            tenantId,
            name: candidate.name,
            slug: candidate.slug,
            isActive: true,
            autoPrintEnabled: false,
          },
        });
      }
    }

    return this.db.printStation.findMany({
      where: { tenantId },
      include: { devices: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  private async getKdsStationCandidates(tenantId: string): Promise<Array<{ name: string; slug: string }>> {
    const stations = new Map<string, { name: string; slug: string }>();

    const addStation = (rawStation: string | null | undefined) => {
      const name = rawStation?.trim();
      if (!name) return;

      const slug = slugify(name);
      if (!slug) return;

      if (!stations.has(slug)) {
        stations.set(slug, { name, slug });
      }
    };

    const categories = await this.db.productCategory.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        templateConfig: true,
      },
    });

    for (const category of categories) {
      const config = category.templateConfig;
      if (config && typeof config === 'object' && !Array.isArray(config)) {
        const station = (config as Prisma.JsonObject).station;
        if (typeof station === 'string') {
          addStation(station);
        }
      }
    }

    const activeJobStations = await this.db.printJob.groupBy({
      by: ['station'],
      where: {
        tenantId,
        status: {
          notIn: [PrintJobStatus.completed, PrintJobStatus.failed],
        },
      },
    });

    for (const jobStation of activeJobStations) {
      addStation(jobStation.station);
    }

    return Array.from(stations.values());
  }

  async createStation(tenantId: string, data: { name: string; slug: string; autoPrintEnabled: boolean }) {
    return this.db.printStation.create({
      data: {
        tenantId,
        name: data.name,
        slug: data.slug,
        autoPrintEnabled: data.autoPrintEnabled,
      },
    });
  }

  async getDevices(tenantId: string) {
    return this.db.printerDevice.findMany({
      where: { tenantId },
      include: { station: true },
    });
  }

  async updateDevice(tenantId: string, deviceId: string, data: {
    stationId?: string | null;
    name?: string;
    connectionType?: string;
    address?: string;
    vendor?: string;
    model?: string;
    paperWidth?: number;
    isDefault?: boolean;
    isPrimary?: boolean;
    role?: string;
    purpose?: string;
    autoPrintEnabled?: boolean;
    isActive?: boolean;
  }) {
    await this.assertStationBelongsToTenant(tenantId, data.stationId);

    const current = await this.db.printerDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true, isPrimary: true },
    });

    if (!current) {
      throw new NotFoundException('Device not found');
    }

    const nextIsPrimary = data.isPrimary ?? current.isPrimary;
    if (nextIsPrimary) {
      await this.db.printerDevice.updateMany({
        where: { tenantId, id: { not: deviceId }, isPrimary: true, isActive: true },
        data: { isPrimary: false, isDefault: false, role: 'station' },
      });
    }

    return this.db.printerDevice.update({
      where: { id: deviceId },
      data: {
        stationId: data.stationId,
        name: data.name,
        connectionType: data.connectionType,
        address: data.address,
        vendor: data.vendor,
        model: data.model,
        paperWidth: data.paperWidth,
        isDefault: data.isDefault,
        isPrimary: data.isPrimary,
        role: data.role,
        purpose: data.purpose,
        autoPrintEnabled: data.autoPrintEnabled,
        isActive: data.isActive,
      },
    });
  }

  async createDevice(tenantId: string, data: {
    stationId?: string | null;
    name: string;
    connectionType: string;
    address?: string;
    vendor?: string;
    model?: string;
    paperWidth?: number;
    isDefault?: boolean;
    isPrimary?: boolean;
    role?: string;
    purpose?: string;
    autoPrintEnabled?: boolean;
  }) {
    await this.assertStationBelongsToTenant(tenantId, data.stationId);

    const isPrimary = data.isPrimary === true || data.role === 'primary_order';
    const role = isPrimary ? 'primary_order' : (data.role || 'station');
    const purpose = isPrimary ? 'main_receipt' : (data.purpose || 'production_ticket');

    if (!isPrimary && !data.stationId) {
      throw new BadRequestException('Station printer requires stationId');
    }

    if (isPrimary) {
      await this.db.printerDevice.updateMany({
        where: {
          tenantId,
          isPrimary: true,
          isActive: true,
        },
        data: {
          isPrimary: false,
          isDefault: false,
          role: 'station',
        },
      });
    }

    return this.db.printerDevice.create({
      data: {
        tenantId,
        name: data.name,
        connectionType: data.connectionType,
        address: data.address,
        vendor: data.vendor,
        model: data.model,
        paperWidth: data.paperWidth,
        isDefault: data.isDefault ?? isPrimary,
        isPrimary,
        role,
        purpose,
        autoPrintEnabled: data.autoPrintEnabled ?? true,
        stationId: isPrimary ? null : data.stationId,
      },
    });
  }

  async reprintJob(tenantId: string, jobId: string) {
    const job = await this.db.printJob.findUnique({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return this.db.printJob.create({
      data: {
        tenantId,
        orderId: job.orderId,
        station: job.station,
        type: job.type,
        content: `*** REIMPRESSÃO ***\n\n${job.content}`,
        status: PrintJobStatus.pending,
      },
    });
  }

  async getNextSpoolerJob(tenantId: string, deviceId: string) {
    // Find device and station
    const device = await this.db.printerDevice.findUnique({
      where: { id: deviceId, tenantId },
      include: { station: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const stationKeys = device.isPrimary
      ? ['MAIN']
      : Array.from(new Set([device.station?.slug, device.station?.name].filter(Boolean)));

    if (stationKeys.length === 0) {
      throw new BadRequestException('Station device has no station configured');
    }

    const staleLockCutoff = new Date(Date.now() - 5 * 60 * 1000);

    const claimableWhere: Prisma.PrintJobWhereInput = {
      tenantId,
      station: { in: stationKeys },
      OR: [
        { status: PrintJobStatus.pending, lockedAt: null },
        { status: PrintJobStatus.printing, lockedAt: { lt: staleLockCutoff } },
      ],
    };

    return this.db.$transaction(async (tx) => {
      const candidate = await tx.printJob.findFirst({
        where: claimableWhere,
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (!candidate) return null;

      const claimedAt = new Date();
      const claimed = await tx.printJob.updateMany({
        where: { id: candidate.id, ...claimableWhere },
        data: {
          status: PrintJobStatus.printing,
          lockedAt: claimedAt,
          lockedBy: deviceId,
          printerDeviceId: deviceId,
          tries: { increment: 1 },
          attempts: { increment: 1 },
          lastTriedAt: claimedAt,
        },
      });

      if (claimed.count !== 1) return null;

      return tx.printJob.findFirst({
        where: { id: candidate.id, tenantId, lockedBy: deviceId },
      });
    });
  }

  async ackSpoolerJob(tenantId: string, jobId: string, deviceId: string) {
    await this.assertDeviceBelongsToTenant(tenantId, deviceId);

    const job = await this.db.printJob.findUnique({
      where: { id: jobId, tenantId },
    });

    if (!job) throw new NotFoundException('Job not found');
    if (job.lockedBy !== deviceId) throw new BadRequestException('Job locked by another device');

    return this.db.printJob.update({
      where: { id: jobId },
      data: {
        status: PrintJobStatus.completed,
        printedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async failSpoolerJob(tenantId: string, jobId: string, deviceId: string, errorMessage: string) {
    await this.assertDeviceBelongsToTenant(tenantId, deviceId);

    const job = await this.db.printJob.findUnique({
      where: { id: jobId, tenantId },
    });

    if (!job) throw new NotFoundException('Job not found');
    if (job.lockedBy !== deviceId) throw new BadRequestException('Job locked by another device');

    const hasReachedMax = job.attempts >= job.maxAttempts;

    return this.db.printJob.update({
      where: { id: jobId },
      data: {
        status: hasReachedMax ? PrintJobStatus.failed : PrintJobStatus.pending,
        failedAt: hasReachedMax ? new Date() : null,
        lastError: errorMessage,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async createPrintJobForOrder(tenantId: string, orderId: string, stationSlug: string, type: PrintType, content: string) {
    const idempotencyKey = `auto_print_${orderId}_${type}_${stationSlug}`;

    return this.createOrReusePrintJob({
      tenantId,
      orderId,
      station: stationSlug,
      type,
      content,
      idempotencyKey,
      status: PrintJobStatus.pending,
    });
  }

  async createMainReceiptJobForOrder(tenantId: string, orderId: string, order: OrderResponseDTO) {
    const hasPrimaryPrinter = await this.db.printerDevice.findFirst({
      where: {
        tenantId,
        isPrimary: true,
        isActive: true,
        autoPrintEnabled: true,
      },
      select: { id: true },
    });

    if (!hasPrimaryPrinter) return null;

    const content = await this.legacyPrinter.formatTicket(order, 'customer');
    return this.createPrintJobForOrder(tenantId, orderId, 'MAIN', PrintType.customer, content);
  }

  async createTestJob(tenantId: string, stationSlug: string, deviceName: string, requestId?: string) {
    const latestOrder = await this.db.order.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!latestOrder) {
      throw new NotFoundException('Nenhum pedido encontrado para criar um job de teste.');
    }

    const content = `GESTOR PRO
TESTE DE IMPRESSAO

Estacao: ${stationSlug}
Dispositivo: ${deviceName}
Data: ${new Date().toLocaleString('pt-BR')}

Bluetooth OK
--- FIM DO TESTE ---`;

    const idempotencyKey = `test_print_${tenantId}_${requestId ?? randomUUID()}`;

    return this.createOrReusePrintJob({
      tenantId,
      orderId: latestOrder.id,
      station: stationSlug,
      type: PrintType.summary,
      content,
      status: PrintJobStatus.pending,
      idempotencyKey,
    });
  }
}
