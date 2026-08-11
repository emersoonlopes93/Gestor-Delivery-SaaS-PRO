import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PublicOrderTrackingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isValidToken(token: string): Promise<boolean> {
    if (!token) return false;
    const order = await this.prisma.order.findUnique({
      where: { publicTrackingToken: token },
      select: { id: true },
    });
    return order !== null;
  }
}
