import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = (process.env.VITE_API_URL || 'http://localhost:3333').replace(/\/$/, '');
const CACHE_TTL_MS = 300000;
const cache = new Map();

app.set('trust proxy', true);
app.use(express.static(path.resolve(__dirname, 'dist'), { index: false }));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absolutePublicUrl(value, origin) {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

async function getStorefront(slug) {
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) return cached.data;

  const [response, brandingResponse] = await Promise.all([
    fetch(`${API_URL}/public/storefront/${encodeURIComponent(slug)}`),
    fetch(`${API_URL}/public/storefront/branding`),
  ]);
  if (!response.ok) return null;
  const payload = await response.json();
  if (!payload?.tenant) return null;

  const branding = brandingResponse.ok ? await brandingResponse.json() : null;
  const data = { tenant: payload.tenant, customization: payload.customization || null, branding };
  cache.set(slug, { data, timestamp: Date.now() });
  return data;
}

app.get('/manifest/:slug.webmanifest', async (req, res) => {
  const storefront = await getStorefront(req.params.slug).catch(() => null);
  const tenant = storefront?.tenant;
  const name = tenant?.name || storefront?.branding?.systemName || 'PedeHub';
  const origin = `${req.protocol}://${req.get('host')}`;
  const icon = absolutePublicUrl(tenant?.logo, origin) || '/icons/app-icon.svg';

  res.type('application/manifest+json').send(JSON.stringify({
    id: `/${req.params.slug}`,
    name,
    short_name: name.substring(0, 12),
    description: tenant?.description || 'Confira nosso cardápio online e faça seu pedido.',
    start_url: `/${req.params.slug}`,
    scope: `/${req.params.slug}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111827',
    lang: 'pt-BR',
    icons: [{ src: icon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }));
});

app.get('/*', async (req, res) => {
  const htmlPath = path.resolve(__dirname, 'dist', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf-8');
  const [slug] = req.path.split('/').filter(Boolean);

  if (!slug || req.path.includes('.')) return res.send(html);

  try {
    const storefront = await getStorefront(slug);
    const tenant = storefront?.tenant;
    if (!tenant) return res.send(html);

    const origin = `${req.protocol}://${req.get('host')}`;
    const canonicalUrl = new URL(req.path, origin).href;
    const systemName = storefront.branding?.systemName || 'PedeHub';
    const socialTitle = tenant.name || systemName;
    const title = `${socialTitle} - Cardápio Online`;
    const description = tenant.description || 'Confira nosso cardápio online e faça seu pedido.';
    const socialImage = absolutePublicUrl(
      tenant.banner || tenant.logo || storefront.customization?.theme?.heroImageUrl || storefront.branding?.logoUrl,
      origin,
    );
    const favicon = absolutePublicUrl(tenant.logo, origin);
    const imageTags = socialImage
      ? `<meta property="og:image" content="${escapeHtml(socialImage)}" />\n<meta name="twitter:image" content="${escapeHtml(socialImage)}" />`
      : '';
    const metaTags = `
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${favicon ? `<link rel="icon" href="${escapeHtml(favicon)}" />` : ''}
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(socialTitle)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
${imageTags}
<meta property="og:site_name" content="${escapeHtml(socialTitle)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(socialTitle)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<link rel="manifest" href="/manifest/${encodeURIComponent(slug)}.webmanifest" />`;

    html = html.replace('<title>PedeHub</title>', metaTags);
  } catch (error) {
    console.error('Erro ao gerar metadados públicos do storefront:', error);
  }

  return res.send(html);
});

app.listen(PORT, () => {
  console.log(`Storefront Server rodando na porta ${PORT}`);
});
