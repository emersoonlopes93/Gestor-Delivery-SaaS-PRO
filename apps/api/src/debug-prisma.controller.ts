import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { Public } from './common/decorators';
import * as bcrypt from 'bcryptjs';

@Controller('debug-prisma')
export class DebugPrismaController {
  constructor(private readonly prisma: PrismaService) {}

  private ensureDebugEnabled() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
  }

  @Public()
  @Get('users')
  async getUsers(@Query('email') email: string) {
    this.ensureDebugEnabled();

    const directUser = await this.prisma.tenantUser.findFirst({
      where: email ? { email } : {},
      include: { tenant: true }
    });

    return {
      directUser: directUser ? {
        id: directUser.id,
        email: directUser.email,
        tenantId: directUser.tenantId,
        tenantSlug: directUser.tenant?.slug,
        isActive: directUser.isActive
      } : null,
      contextTenantId: this.prisma.tenantContext?.getTenantId()
    };
  }

  @Public()
  @Get('test-hash')
  async testHash(@Query('email') email: string, @Query('pass') pass: string) {
    this.ensureDebugEnabled();

    const user = await this.prisma.tenantUser.findFirst({
      where: { email },
    });

    if (!user) return { error: 'User not found' };

    const match = await bcrypt.compare(pass, user.passwordHash);
    return {
      email,
      pass,
      hash: user.passwordHash,
      match
    };
  }

  @Public()
  @Get('context')
  async getContext() {
    this.ensureDebugEnabled();
    return {
      contextTenantId: this.prisma.tenantContext?.getTenantId(),
    };
  }
}
