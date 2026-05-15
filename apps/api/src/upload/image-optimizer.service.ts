import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ImageOptimizerService {
  async optimize(
    buffer: Buffer,
    tenantId: string,
    originalFilename: string,
  ): Promise<string> {
    const destination = join('uploads', tenantId);
    mkdirSync(destination, { recursive: true });

    // Gera nome único com extensão webp
    const nameWithoutExt = originalFilename.split('.')[0] || 'img';
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const outputFilename = `${timestamp}-${random}.webp`;
    const outputPath = join(destination, outputFilename);

    await sharp(buffer)
      .resize(1200, 1200, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 3 })
      .toFile(outputPath);

    return outputFilename;
  }
}
