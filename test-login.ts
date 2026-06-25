import { PrismaClient } from '@prisma/client';
import { TenantAuthService } from './apps/api/src/auth/services/tenant-auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TenantBillingResolverService } from './apps/api/src/billing/services/tenant-billing-resolver.service';

const prisma = new PrismaClient();
const jwt = new JwtService({ secret: 'test-secret' });
const config = new ConfigService();
const billingResolver = new TenantBillingResolverService(prisma);
const authService = new TenantAuthService(prisma, jwt, config, billingResolver);

async function main() {
  const t = await prisma.tenantUser.findFirst({
    where: { email: 'demo@demo.com' }
  });
  
  if (t) {
    const payload = await authService.buildSessionUser(t.id, t.tenantId);
    console.log('--- SESSION PAYLOAD ---');
    console.log(JSON.stringify(payload, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
