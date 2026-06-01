import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client | null = null;
  private readonly driver: 'local' | 'r2';
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<'local' | 'r2'>('STORAGE_DRIVER') || 'local';
    this.uploadDir = path.join(process.cwd(), this.config.get<string>('UPLOAD_DIR', 'uploads'));

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

  async delete(key: string): Promise<void> {
    if (this.driver === 'r2') {
      try {
        await this.s3Client!.send(
          new DeleteObjectCommand({
            Bucket: this.config.getOrThrow<string>('R2_BUCKET'),
            Key: key,
          }),
        );
      } catch (err) {
        this.logger.error(`Erro ao deletar arquivo no R2: ${key}`, err);
      }
    } else {
      const filePath = path.join(this.uploadDir, key);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        this.logger.error(`Erro ao deletar arquivo local: ${filePath}`, err);
      }
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
      const destinationPath = path.join(this.uploadDir, params.key);
      const directory = path.dirname(destinationPath);

      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(destinationPath, params.buffer);

      // Replace windows backward slashes with forward slashes for URL path compatibility
      const webPath = params.key.replace(/\\/g, '/');
      // Fix: Use correct environment variable or default
      const baseUrl = this.config.get<string>('MEDIA_PUBLIC_BASE_URL') || `${this.config.get<string>('API_PREFIX', '/api/v1')}/static`;
      const url = `${baseUrl}/${webPath}`;

      return { key: params.key, url };
    }
  }

  async deleteObject(key: string): Promise<void> {
    return this.delete(key);
  }
}
