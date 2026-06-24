import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { instanceName: 'gestor_kigula2_40ya4' }
  });

  const systemConfig = await prisma.systemConfig.findUnique({ where: { id: 'global' } });

  if (!instance || !systemConfig?.evolutionUrl) return;

  const client = axios.create({
    baseURL: systemConfig.evolutionUrl.replace(/\/+$/, ''),
    headers: {
      'Content-Type': 'application/json',
      apikey: instance.apiKey,
      instanceId: instance.evolutionInstanceId || instance.instanceName
    }
  });

  const urlsToTry = [
    `/chat/findContacts`,
    `/chat/profile`,
    `/chat/fetchProfile`,
    `/chat/profileName`
  ];

  for (const url of urlsToTry) {
      console.log('Trying:', url);
      try {
          const res = await client.get(url);
          console.log('Success:', url, JSON.stringify(res.data).substring(0, 200));
      } catch (e) {
          console.log('Failed:', url, e.response?.status, e.response?.data);
      }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
