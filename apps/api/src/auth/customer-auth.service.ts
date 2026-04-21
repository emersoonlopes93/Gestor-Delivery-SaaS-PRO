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
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import type { CustomerJwtPayload } from '@gestor/types';

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger('CustomerAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly customerService: CustomerService,
    private readonly whatsappCloud: WhatsAppCloudService,
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

    // AUDIT: Check cooldown (prevent flooding)
    const lastOtp = await this.prisma.customerOTP.findFirst({
      where: {
        tenantId: tenant.id,
        phone: cleanPhone,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) }, // Last 60 seconds
      },
    });

    if (lastOtp) {
      throw new BadRequestException('Aguarde 60 segundos para solicitar um novo código');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save to DB
    const created = await this.prisma.customerOTP.create({
      data: {
        tenantId: tenant.id,
        phone: cleanPhone,
        code,
        expiresAt,
      },
    });

    try {
      await this.whatsappCloud.sendOtp(cleanPhone, code);
    } catch (e) {
      // Se falhar o envio, remove o OTP criado para evitar "código pendurado" sem entrega.
      await this.prisma.customerOTP.delete({ where: { id: created.id } }).catch(() => undefined);
      throw new BadRequestException('Não foi possível enviar o código no momento. Tente novamente.');
    }

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

    // Find the latest active OTP for this phone
    const otp = await this.prisma.customerOTP.findFirst({
      where: {
        tenantId: tenant.id,
        phone: cleanPhone,
        usedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 }, // Block after 5 failed attempts
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('Código inválido, expirado ou excesso de tentativas');
    }

    if (otp.code !== code) {
      // Increment attempts
      await this.prisma.customerOTP.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      
       throw new UnauthorizedException('Código inválido');
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
      'Cliente Novo',
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
