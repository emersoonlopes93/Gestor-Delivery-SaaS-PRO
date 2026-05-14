import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.VITE_API_URL || 'http://localhost:3333';

// Cache para evitar bater na API toda hora por meta tags
const cache = new Map();

// Servir arquivos estáticos (js, css, imagens)
app.use(express.static(path.resolve(__dirname, 'dist'), { index: false }));

app.get('/*', async (req, res) => {
  const urlPath = req.path;
  
  // Pegar o slug (primeira parte da URL)
  const segments = urlPath.split('/').filter(Boolean);
  const slug = segments[0];

  let html = fs.readFileSync(path.resolve(__dirname, 'dist', 'index.html'), 'utf-8');

  if (slug && !urlPath.includes('.')) {
    try {
      let tenantInfo = cache.get(slug);
      
      // Cache simpes de 5 minutos
      if (!tenantInfo || (Date.now() - tenantInfo.timestamp > 300000)) {
        const response = await fetch(`${API_URL}/storefront/${slug}`);
        if (response.ok) {
          const data = await response.json();
          tenantInfo = {
            data: data.tenant,
            timestamp: Date.now()
          };
          cache.set(slug, tenantInfo);
        }
      }

      if (tenantInfo && tenantInfo.data) {
        const title = `Pedir em ${tenantInfo.data.name} | Gestor Delivery`;
        const description = `Acesse o cardápio de ${tenantInfo.data.name} e faça seu pedido online.`;
        const logo = tenantInfo.data.logo || 'https://via.placeholder.com/600x315?text=Gestor+Delivery';

        const metaTags = `
          <title>${title}</title>
          <meta name="description" content="${description}" />
          
          <!-- Open Graph / Facebook / WhatsApp -->
          <meta property="og:type" content="website" />
          <meta property="og:title" content="${title}" />
          <meta property="og:description" content="${description}" />
          <meta property="og:image" content="${logo}" />
          <meta property="og:site_name" content="${tenantInfo.data.name}" />

          <!-- Twitter -->
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${title}" />
          <meta name="twitter:description" content="${description}" />
          <meta name="twitter:image" content="${logo}" />
        `;

        // Substituir a tag estática pela tag dinâmica
        html = html.replace('<title>web-storefront</title>', metaTags);
      }
    } catch (error) {
      console.error('Erro ao injetar meta tags:', error);
    }
  }

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Storefront Server (com SEO dinâmico) rodando na porta ${PORT}`);
});
