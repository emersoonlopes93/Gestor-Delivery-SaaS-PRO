const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const data = {
    id: "global",
    defaultWhatsAppProvider: "evolution_go",
    defaultAiProvider: "openai",
    evolutionUrl: "",
    evolutionGlobalToken: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    googleAiApiKey: "",
    googleAiModel: "gemini-2.0-flash-lite",
    baseAiPrompt: "",
    updatedAt: new Date().toISOString()
  };

  const { id, updatedAt, createdAt, ...updateData } = data;

  try {
    const result = await prisma.systemConfig.upsert({
      where: { id: 'global' },
      update: updateData,
      create: {
        id: 'global',
        ...updateData,
        defaultWhatsAppProvider: updateData.defaultWhatsAppProvider || 'evolution_go',
        defaultAiProvider: updateData.defaultAiProvider || 'openai',
      },
    });
    console.log("Success:", result);
  } catch (err) {
    console.error("Prisma Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
