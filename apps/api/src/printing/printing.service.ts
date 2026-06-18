import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma, PrintJobStatus, PrintType } from '@prisma/client';
import { PrinterService as LegacyPrinterService } from '../pos/printer.service';
import { slugify } from '@gestor/utils';

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly legacyPrinter: LegacyPrinterService,
  ) {}

  async getJobs(tenantId: string) {
    return this.db.printJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getStations(tenantId: string) {
    return this.ensurePrintStationsForTenant(tenantId);
  }

  async ensurePrintStationsForTenant(tenantId: string) {
    const stationCandidates = await this.getKdsStationCandidates(tenantId);
    const candidates = stationCandidates.length > 0
      ? stationCandidates
      : [{ name: 'Geral / Balcão', slug: 'general' }];

    for (const candidate of candidates) {
      await this.db.printStation.upsert({
        where: {
          tenantId_slug: {
            tenantId,
            slug: candidate.slug,
          },
        },
        create: {
          tenantId,
          name: candidate.name,
          slug: candidate.slug,
          isActive: true,
          autoPrintEnabled: false,
        },
        update: {
          isActive: true,
        },
      });
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

  async createDevice(tenantId: string, data: { stationId: string; name: string; connectionType: string; address?: string; vendor?: string; model?: string; paperWidth?: number; isDefault?: boolean }) {
    return this.db.printerDevice.create({
      data: {
        tenantId,
        ...data,
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

    const stationKeys = Array.from(new Set([device.station.slug, device.station.name].filter(Boolean)));

    // Find next pending job
    const job = await this.db.printJob.findFirst({
      where: {
        tenantId,
        station: { in: stationKeys },
        status: PrintJobStatus.pending,
        lockedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) {
      return null;
    }

    // Lock the job
    return this.db.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.printing,
        lockedAt: new Date(),
        lockedBy: deviceId,
        printerDeviceId: deviceId,
        tries: { increment: 1 },
        attempts: { increment: 1 },
        lastTriedAt: new Date(),
      },
    });
  }

  async ackSpoolerJob(tenantId: string, jobId: string, deviceId: string) {
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
    const job = await this.db.printJob.findUnique({
      where: { id: jobId, tenantId },
    });

    if (!job) throw new NotFoundException('Job not found');

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
    
    // Check if already exists
    const existing = await this.db.printJob.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return existing;
    }

    return this.db.printJob.create({
      data: {
        tenantId,
        orderId,
        station: stationSlug,
        type,
        content,
        idempotencyKey,
        status: PrintJobStatus.pending,
      },
    });
  }

  async createTestJob(tenantId: string, stationSlug: string, deviceName: string) {
    const content = `GESTOR PRO
TESTE DE IMPRESSAO

Estacao: ${stationSlug}
Dispositivo: ${deviceName}
Data: ${new Date().toLocaleString('pt-BR')}

Bluetooth OK
--- FIM DO TESTE ---`;

    return this.db.printJob.create({
      data: {
        tenantId,
        orderId: 'TEST',
        station: stationSlug,
        type: PrintType.summary,
        content,
        status: PrintJobStatus.pending,
      },
    });
  }
}
