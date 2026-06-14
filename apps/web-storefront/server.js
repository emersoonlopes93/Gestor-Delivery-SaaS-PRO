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

// Rota dinâmica para o Manifest.webmanifest do Lojista
app.get('/manifest/:slug.webmanifest', async (req, res) => {
  const { slug } = req.params;

  const manifest = {
    "id": `/${slug}`,
    "name": "Gestor Delivery",
    "short_name": "Delivery",
    "description": "Cardapio, pedidos, carteira, fidelidade e tracking em tempo real.",
    "start_url": `/${slug}`,
    "scope": `/${slug}`,
    "display": "standalone",
    "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
    "orientation": "portrait",
    "background_color": "#ffffff",
    "theme_color": "#111827",
    "categories": ["food", "shopping", "business"],
    "lang": "pt-BR",
    "icons": [
      {
        "src": "/icons/app-icon.svg",
        "sizes": "any",
        "type": "image/svg+xml",
        "purpose": "any"
      },
      {
        "src": "/icons/app-maskable.svg",
        "sizes": "any",
        "type": "image/svg+xml",
        "purpose": "maskable"
      }
    ],
    "shortcuts": [
      {
        "name": "Meus pedidos",
        "short_name": "Pedidos",
        "description": "Abrir historico de pedidos do cliente.",
        "url": `/${slug}/orders`,
        "icons": [{ "src": "/icons/app-icon.svg", "sizes": "any", "type": "image/svg+xml" }]
      }
    ]
  };

  try {
    let tenantInfo = cache.get(slug);
    if (!tenantInfo || (Date.now() - tenantInfo.timestamp > 300000)) {
      const response = await fetch(`${API_URL}/storefront/${slug}`);
      if (response.ok) {
        const data = await response.json();
        tenantInfo = { data: data.tenant, timestamp: Date.now() };
        cache.set(slug, tenantInfo);
      }
    }

    if (tenantInfo && tenantInfo.data) {
      manifest.name = tenantInfo.data.name;
      // short_name deve ser mais curto para caber nos ícones
      manifest.short_name = tenantInfo.data.name.substring(0, 12);
    }
  } catch (error) {
    console.error('Erro ao buscar dados para o manifest dinâmico:', error);
  }

  res.setHeader('Content-Type', 'application/manifest+json');
  res.send(JSON.stringify(manifest));
});

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
          
          <!-- PWA Dinâmico -->
          <link rel="manifest" href="/manifest/${slug}.webmanifest" />
        `;

        // Substituir as tags padrão do Vite/React pelo conteúdo dinâmico
        // O index.html original tem <title>Gestor Delivery</title> e um <link rel="manifest" href="/manifest.webmanifest" />
        html = html.replace('<title>Gestor Delivery</title>', metaTags);
        html = html.replace('<link rel="manifest" href="/manifest.webmanifest" />', '');
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
