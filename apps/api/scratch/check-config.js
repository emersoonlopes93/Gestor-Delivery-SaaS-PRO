const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { id: 'global' },
    });
    if (!config) {
      console.log('Nenhuma configuração global encontrada no banco de dados.');
      return;
    }

    console.log('=== Configuração Global de IA ===');
    console.log('Default AI Provider:', config.defaultAiProvider);
    console.log('Fallback AI Provider:', config.fallbackAiProvider);
    console.log('Fallback AI Model:', config.fallbackAiModel);
    console.log('Google AI Model:', config.googleAiModel);
    console.log('Google AI API Key existe:', !!config.googleAiApiKey);
    if (config.googleAiApiKey) {
      console.log('Google AI API Key (length):', config.googleAiApiKey.length);
      console.log('Google AI API Key (prefix):', config.googleAiApiKey.substring(0, 8) + '...');
    }
    console.log('OpenAI Model:', config.openaiModel);
    console.log('OpenAI API Key existe:', !!config.openaiApiKey);
    if (config.openaiApiKey) {
      console.log('OpenAI API Key (length):', config.openaiApiKey.length);
    }
  } catch (error) {
    console.error('Erro ao ler do banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
