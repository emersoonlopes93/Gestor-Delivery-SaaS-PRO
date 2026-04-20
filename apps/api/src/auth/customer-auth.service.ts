import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CustomerService } from '../crm/customer.service';
import type { CustomerJwtPayload } from '@gestor/types';

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger('CustomerAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly customerService: CustomerService,
  ) {}

  /**
   * Generates a 6-digit OTP and "sends" it.
   */
  async sendOtp(phone: string, tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new BadRequestException('Loja não encontrada');
    }

    // Clean phone number (only digits)
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      throw new BadRequestException('Telefone inválido');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save to DB
    await this.prisma.customerOTP.create({
      data: {
        tenantId: tenant.id,
        phone: cleanPhone,
        code,
        expiresAt,
      },
    });

    // MOCK: In production, send via SMS/WhatsApp gateway
    this.logger.log(`[OTP] Para ${cleanPhone} em ${tenantSlug}: ${code}`);
    console.log(`\n\n>>> OTP CODE FOR ${cleanPhone}: ${code} <<<\n\n`);

    return { message: 'Código enviado com sucesso' };
  }

  /**
   * Validates OTP and returns access token.
   */
  async validateOtp(phone: string, code: string, tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new BadRequestException('Loja não encontrada');
    }

    const cleanPhone = phone.replace(/\D/g, '');

    const otp = await this.prisma.customerOTP.findFirst({
      where: {
        tenantId: tenant.id,
        phone: cleanPhone,
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    // Mark as used
    await this.prisma.customerOTP.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    // Upsert customer (ensure they exist)
    const customer = await this.customerService.syncCustomerOnOrderUpsert(
      tenant.id,
      cleanPhone,
      'Cliente Novo', // Default name, can be updated later
    );

    if (!customer) {
       throw new UnauthorizedException('Erro ao vincular cliente');
    }

    // Generate Token
    const payload: CustomerJwtPayload = {
      sub: customer.id,
      tenantId: tenant.id,
      type: 'customer',
      phone: customer.phone,
      name: customer.name,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '30d', // Long lived session for customers
    });

    return {
      accessToken,
      customer: {
        id: customer.id,
        tenantId: customer.tenantId,
        name: customer.name,
        phone: customer.phone,
      },
    };
  }
}
