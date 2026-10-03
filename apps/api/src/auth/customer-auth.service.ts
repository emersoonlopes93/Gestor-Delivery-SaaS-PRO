import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { CustomerService } from '../crm/customer.service';
import { WhatsAppSenderService } from '../whatsapp-channel/services/whatsapp-sender.service';
import { CustomerIdentityProvider, Prisma } from '@prisma/client';
import type { CustomerGoogleSignInResponse, CustomerLoginResponse } from '@gestor/types';
import { CustomerGoogleVerifierService } from './customer-google-verifier.service';
import { CustomerSessionService } from './customer-session.service';
import type { SessionContext } from './auth-session.service';

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger('CustomerAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly customerService: CustomerService,
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly googleVerifier: CustomerGoogleVerifierService,
    private readonly customerSessionService: CustomerSessionService,
  ) {}

  async resolveTenantId(tenantSlug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) throw new BadRequestException('Loja nÃ£o encontrada');
    return tenant.id;
  }

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
      await this.whatsappSender.sendText(tenant.id, {
        to: this.normalizeBrazilPhone(cleanPhone),
        text: this.getOtpMessage(code),
      });
    } catch {
      // Se falhar o envio, remove o OTP criado para evitar "código pendurado" sem entrega.
      await this.prisma.customerOTP.delete({ where: { id: created.id } }).catch(() => undefined);
      throw new BadRequestException('Não foi possível enviar o código no momento. Tente novamente.');
    }

    return { message: 'Código enviado com sucesso' };
  }

  /**
   * Validates OTP and returns access token.
   */
  async validateOtp(
    phone: string,
    code: string,
    tenantSlug: string,
    googleLinkCapability?: string,
    context?: SessionContext,
  ): Promise<CustomerLoginResponse> {
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

    if (googleLinkCapability) {
      await this.linkGoogleIdentityFromCapability(googleLinkCapability, tenant.id, customer.id);
    }

    return this.customerSessionService.issue(customer, context);
  }

  async signInWithGoogle(
    credential: string,
    tenantSlug: string,
    context?: SessionContext,
  ): Promise<CustomerGoogleSignInResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) {
      throw new BadRequestException('Loja não encontrada');
    }

    const google = await this.googleVerifier.verifyCredential(credential);
    const identity = await this.prisma.customerExternalIdentity.findUnique({
      where: {
        tenantId_provider_providerSubject: {
          tenantId: tenant.id,
          provider: CustomerIdentityProvider.GOOGLE,
          providerSubject: google.subject,
        },
      },
      include: { customer: true },
    });

    if (identity) {
      if (identity.customer.tenantId !== tenant.id) {
        throw new UnauthorizedException('Invalid Google identity');
      }
      return {
        status: 'AUTHENTICATED',
        ...await this.customerSessionService.issue(identity.customer, context),
      };
    }

    return {
      status: 'PHONE_LINK_REQUIRED',
      googleLinkCapability: this.createGoogleLinkCapability(tenant.id, google.subject),
    };
  }

  private createGoogleLinkCapability(tenantId: string, providerSubject: string): string {
    return this.jwtService.sign(
      {
        type: 'customer_google_link',
        tenantId,
        provider: CustomerIdentityProvider.GOOGLE,
        providerSubject,
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'dev-secret'),
        audience: 'customer-google-link',
        expiresIn: '5m',
      },
    );
  }

  private async linkGoogleIdentityFromCapability(
    capability: string,
    tenantId: string,
    customerId: string,
  ): Promise<void> {
    const payload = this.verifyGoogleLinkCapability(capability);
    if (payload.tenantId !== tenantId) {
      throw new UnauthorizedException('Invalid Google link capability');
    }

    const existing = await this.prisma.customerExternalIdentity.findUnique({
      where: {
        tenantId_provider_providerSubject: {
          tenantId,
          provider: CustomerIdentityProvider.GOOGLE,
          providerSubject: payload.providerSubject,
        },
      },
    });
    if (existing) {
      if (existing.customerId === customerId) return;
      throw new ConflictException({ code: 'GOOGLE_IDENTITY_ALREADY_LINKED' });
    }

    const customerProviderIdentity = await this.prisma.customerExternalIdentity.findUnique({
      where: {
        customerId_provider: { customerId, provider: CustomerIdentityProvider.GOOGLE },
      },
    });
    if (customerProviderIdentity) {
      throw new ConflictException({ code: 'GOOGLE_IDENTITY_ALREADY_LINKED' });
    }

    try {
      await this.prisma.customerExternalIdentity.create({
        data: {
          tenantId,
          customerId,
          provider: CustomerIdentityProvider.GOOGLE,
          providerSubject: payload.providerSubject,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedIdentity = await this.prisma.customerExternalIdentity.findUnique({
          where: {
            tenantId_provider_providerSubject: {
              tenantId,
              provider: CustomerIdentityProvider.GOOGLE,
              providerSubject: payload.providerSubject,
            },
          },
        });
        if (racedIdentity?.customerId === customerId) return;
        throw new ConflictException({ code: 'GOOGLE_IDENTITY_ALREADY_LINKED' });
      }
      throw error;
    }
  }

  private verifyGoogleLinkCapability(capability: string): {
    type: 'customer_google_link';
    tenantId: string;
    provider: 'GOOGLE';
    providerSubject: string;
  } {
    try {
      const payload = this.jwtService.verify<Record<string, unknown>>(capability, {
        secret: this.config.get<string>('JWT_SECRET', 'dev-secret'),
        audience: 'customer-google-link',
      });
      if (
        payload.type !== 'customer_google_link'
        || typeof payload.tenantId !== 'string'
        || payload.provider !== CustomerIdentityProvider.GOOGLE
        || typeof payload.providerSubject !== 'string'
        || !payload.providerSubject
      ) {
        throw new UnauthorizedException('Invalid Google link capability');
      }
      return {
        type: 'customer_google_link',
        tenantId: payload.tenantId,
        provider: CustomerIdentityProvider.GOOGLE,
        providerSubject: payload.providerSubject,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid Google link capability');
    }
  }

  private normalizeBrazilPhone(cleanPhoneDigits: string): string {
    if (cleanPhoneDigits.startsWith('55')) return cleanPhoneDigits;
    return `55${cleanPhoneDigits}`;
  }

  private getOtpMessage(code: string): string {
    const template = this.config.get<string>('WHATSAPP_OTP_MESSAGE_TEMPLATE') || 'Seu código de acesso é: {CODE}';
    return template.replace(/\{\{?CODE\}?\}/g, code);
  }
}
