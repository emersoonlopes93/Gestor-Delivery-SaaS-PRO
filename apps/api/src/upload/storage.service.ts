import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client | null = null;
  private readonly driver: 'local' | 'r2';
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<'local' | 'r2'>('STORAGE_DRIVER') || 'local';

    if (this.driver === 'r2') {
      const rawAccountId = this.config.get<string>('R2_ACCOUNT_ID') || '';
      // Sanitizar R2_ACCOUNT_ID para remover qualquer URL inteira ou sufixos comuns do Cloudflare R2
      const accountId = rawAccountId
        .replace(/^https?:\/\//i, '')
        .replace(/\.r2\.cloudflarestorage\.com\/?$/i, '')
        .replace(/\/+$/, '')
        .trim();

      const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
      const region = this.config.get<string>('R2_REGION', 'auto');

      this.s3Client = new S3Client({
        region,
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        forcePathStyle: true, // Obrigatório para evitar erros de DNS virtual-host com subdomínios no Cloudflare R2
        credentials: {
          accessKeyId: accessKeyId || '',
          secretAccessKey: secretAccessKey || '',
        },
      });
      this.logger.log('StorageService inicializado com driver Cloudflare R2.');
    } else {
      this.logger.log('StorageService inicializado com driver Local.');
    }
  }

  async uploadBuffer(params: {
    buffer: Buffer;
    key: string;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<{ key: string; url: string }> {
    if (this.driver === 'r2') {
      const bucket = this.config.get<string>('R2_BUCKET') || '';
      const publicBaseUrl = this.config.get<string>('R2_PUBLIC_BASE_URL') || '';

      await this.s3Client!.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: params.buffer,
          ContentType: params.contentType,
          Metadata: params.metadata,
        }),
      );

      // Construct public URL as R2_PUBLIC_BASE_URL + "/" + key
      const cleanBaseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
      const url = `${cleanBaseUrl}/${params.key}`;

      return { key: params.key, url };
    } else {
      // Local driver for development
      const destinationPath = join(process.cwd(), 'uploads', params.key);
      const directory = join(destinationPath, '..');

      mkdirSync(directory, { recursive: true });
      writeFileSync(destinationPath, params.buffer);

      const apiPrefix = this.config.get<string>('API_PREFIX', '/api/v1');
      // Replace windows backward slashes with forward slashes for URL path compatibility
      const webPath = params.key.replace(/\\/g, '/');
      const url = `${apiPrefix}/static/${webPath}`;

      return { key: params.key, url };
    }
  }

  async deleteObject(key: string): Promise<void> {
    if (this.driver === 'r2') {
      const bucket = this.config.get<string>('R2_BUCKET') || '';
      await this.s3Client!.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } else {
      const filePath = join(process.cwd(), 'uploads', key);
      try {
        unlinkSync(filePath);
      } catch (err) {
        this.logger.warn(`Erro ao deletar arquivo local em ${filePath}: ${String(err)}`);
      }
    }
  }
}
