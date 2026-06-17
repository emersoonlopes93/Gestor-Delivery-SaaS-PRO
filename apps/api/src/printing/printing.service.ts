import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PrintJobStatus, PrintType } from '@prisma/client';
import { PrinterService as LegacyPrinterService } from '../pos/printer.service';

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(
    private readonly db: DatabaseService,
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
    return this.db.printStation.findMany({
      where: { tenantId },
      include: { devices: true },
    });
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

    // Find next pending job
    const job = await this.db.printJob.findFirst({
      where: {
        tenantId,
        station: device.station.slug,
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
}
