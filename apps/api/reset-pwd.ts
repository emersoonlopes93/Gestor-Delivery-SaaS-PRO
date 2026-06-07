import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  const email = 'new9store@gmail.com';
  const newPassword = 'Audit@2024!';
  const hash = await bcrypt.hash(newPassword, 10);
  
  const result = await prisma.tenantUser.updateMany({
    where: { email },
    data: { passwordHash: hash },
  });
  
  console.log(`Updated ${result.count} user(s).`);
  console.log(`New password for ${email}: ${newPassword}`);
}

main().finally(() => prisma.$disconnect());
