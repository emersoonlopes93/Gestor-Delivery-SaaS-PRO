import { AuthSessionStatus, PrismaClient } from '@prisma/client';

const confirmation = process.env.CONFIRM_GLOBAL_SESSION_REVOCATION;
const nodeEnvironment = process.env.NODE_ENV;

if (nodeEnvironment !== 'production' || confirmation !== 'true') {
  console.error('Refusing global session revocation: require NODE_ENV=production and CONFIRM_GLOBAL_SESSION_REVOCATION=true.');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient();

  const revoke = async () => {
    try {
      const activeSessionsBefore = await prisma.authSession.count({
        where: { status: AuthSessionStatus.active },
      });
      const result = await prisma.authSession.updateMany({
        where: { status: AuthSessionStatus.active },
        data: {
          status: AuthSessionStatus.revoked,
          revokedAt: new Date(),
          revokedReason: 'security_jwt_secret_rotation',
        },
      });
      const activeSessionsAfter = await prisma.authSession.count({
        where: { status: AuthSessionStatus.active },
      });

      console.log(JSON.stringify({
        activeSessionsBefore,
        sessionsRevoked: result.count,
        activeSessionsAfter,
      }));
    } finally {
      await prisma.$disconnect();
    }
  };

  void revoke().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`Global session revocation failed: ${message}`);
    process.exitCode = 1;
  });
}
