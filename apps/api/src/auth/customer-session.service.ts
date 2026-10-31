import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSubjectType } from '@prisma/client';
import type { CustomerLoginResponse, CustomerJwtPayload } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { AuthSessionService, type SessionContext } from './auth-session.service';

type CustomerSessionIdentity = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
};

@Injectable()
export class CustomerSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async issue(
    customer: CustomerSessionIdentity,
    context?: SessionContext,
  ): Promise<CustomerLoginResponse> {
    const payload = this.accessPayload(customer.id, customer.tenantId);
    const session = await this.authSessionService.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: customer.id,
      tenantId: customer.tenantId,
      payload,
      context,
    });

    return this.response(customer, session.sessionId, session.refreshToken);
  }

  async refresh(
    refreshToken: string,
    tenantId: string,
    context?: SessionContext,
  ): Promise<CustomerLoginResponse> {
    const rotated = await this.authSessionService.rotateSession({
      refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: tenantId,
      preserveAbsoluteExpiry: true,
      context,
    });

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: rotated.session.subjectId,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
      },
    });
    if (!customer) {
      await this.authSessionService.revokeSession(rotated.sessionId, 'customer_not_found');
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.response(customer, rotated.sessionId, rotated.refreshToken);
  }

  async logout(sessionId: string | undefined) {
    return this.authSessionService.revokeSession(sessionId, 'logout');
  }

  async getCurrent(customerId: string, tenantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        email: true,
        totalOrders: true,
        totalSpent: true,
        loyaltyPoints: true,
        cashbackBalance: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!customer) throw new UnauthorizedException('Customer not found');
    return customer;
  }

  private response(
    customer: CustomerSessionIdentity,
    sessionId: string,
    refreshToken: string,
  ): CustomerLoginResponse {
    return {
      accessToken: this.jwtService.sign({
        ...this.accessPayload(customer.id, customer.tenantId),
        sid: sessionId,
      }),
      refreshToken,
      customer: {
        id: customer.id,
        tenantId: customer.tenantId,
        name: customer.name,
        phone: customer.phone,
      },
    };
  }

  private accessPayload(customerId: string, tenantId: string): Omit<CustomerJwtPayload, 'sid'> {
    return {
      sub: customerId,
      tenantId,
      type: 'customer',
    };
  }
}
