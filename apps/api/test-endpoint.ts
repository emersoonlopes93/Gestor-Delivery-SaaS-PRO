import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import fetch from 'node-fetch'; // need to install or use native fetch in node 18+

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.tenantUser.findFirst({
    where: { email: 'demo@demo.com' }
  });

  if (!user) return console.log('User not found');

  // We need to hit the real local server if it is running.
  // Is it running? Probably not unless the user started it.
  // We can just verify the decorators instead.
  console.log('User found:', user.email);
}
main().finally(() => prisma.$disconnect());
