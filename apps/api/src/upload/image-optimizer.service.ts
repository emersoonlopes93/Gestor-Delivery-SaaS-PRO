import { Injectable, BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';

@Injectable()
export class ImageOptimizerService {
  async optimize(
    buffer: Buffer,
    originalFilename: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const outputFilename = `${timestamp}-${random}.webp`;

    try {
      const optimizedBuffer = await sharp(buffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 3 })
        .toBuffer();

      return {
        buffer: optimizedBuffer,
        filename: outputFilename,
      };
    } catch (err) {
      throw new BadRequestException('Imagem inválida ou corrompida.');
    }
  }
}
