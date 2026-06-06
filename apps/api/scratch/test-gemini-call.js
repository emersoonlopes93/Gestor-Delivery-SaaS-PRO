const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach((line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

async function main() {
  loadEnv();
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    console.log('Nenhuma chave GOOGLE_MAPS_KEY encontrada no .env.');
    return;
  }

  const model = 'gemini-2.0-flash';
  console.log(`Testando chamada para o modelo: ${model}`);
  console.log(`Usando a chave GOOGLE_MAPS_KEY: ${apiKey.substring(0, 8)}...`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Olá, teste de conexão.' }]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log(`Status HTTP: ${response.status}`);
    const text = await response.text();
    console.log('Resposta da API:');
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  } catch (error) {
    console.error('Erro na chamada:', error);
  }
}

main();
