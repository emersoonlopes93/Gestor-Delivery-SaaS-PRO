import { Injectable, BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';

@Injectable()
export class ImageOptimizerService {
  async optimize(
    buffer: Buffer,
    _originalFilename: string,
  ): Promise<{ buffer: Buffer; filename: string; info: sharp.OutputInfo }> {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const outputFilename = `${timestamp}-${random}.webp`;

    try {
      const { data: optimizedBuffer, info } = await sharp(buffer)
        .resize(1920, 1920, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 3 })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: optimizedBuffer,
        filename: outputFilename,
        info,
      };
    } catch {
      throw new BadRequestException('Imagem inválida ou corrompida.');
    }
  }
}
