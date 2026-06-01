
const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw: any = await res.json().catch(() => ({}));
  return { status: res.status, data: raw.data || raw, raw };
}

async function main() {
  console.log('SMOKE TEST: STOREFRONT CUSTOMIZATION');

  // 1. Login
  const login = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  if (login.status !== 200 && login.status !== 201) {
    console.error('❌ Login failed. Is the API running?');
    process.exit(1);
  }

  const token = login.data.accessToken;

  // 2. Get Current Config
  const get = await api('GET', '/tenant/storefront-customization', undefined, token);
  if (get.status === 200) {
    console.log('✅ GET settings works');
  } else {
    console.error('❌ GET settings failed with status:', get.status, get.raw);
    process.exit(1);
  }

  // Use raw data if success wrapper is present
  const getData = get.data;

  // 3. Test Manual Update with Sanitization
  const updateManual = await api('PATCH', '/tenant/storefront-customization', {
    theme: { primaryColor: 'invalid-color', colorMode: 'dark', backgroundStyle: 'clean', borderRadius: 'lg', fontStyle: 'default' }
  }, token);
  
  // Verify it saved but with fallback
  const verifySanitized = await api('GET', '/tenant/storefront-customization', undefined, token);
  const verifySanitizedData = verifySanitized.data;
  if (verifySanitizedData.theme.primaryColor === '#0c93e9') {
    console.log('✅ Color sanitization works (fallback applied)');
  } else {
    console.error('❌ Color sanitization failed:', verifySanitizedData.theme.primaryColor);
  }

  // 4. Test Preset Application
  const updatePreset = await api('PATCH', '/tenant/storefront-customization', {
    presetId: 'sushi-premium'
  }, token);
  
  const verifyPreset = await api('GET', '/tenant/storefront-customization', undefined, token);
  const verifyPresetData = verifyPreset.data;
  if (verifyPresetData.theme.colorMode === 'dark' && verifyPresetData.layout.productLayout === 'premium-card') {
    console.log('✅ Preset application works');
  } else {
    console.error('❌ Preset application failed:', verifyPresetData);
  }

  // 5. Test Versioning
  if (verifyPresetData.theme.version === 1 && verifyPresetData.layout.version === 1) {
    console.log('✅ Versioning works');
  } else {
    console.error('❌ Versioning failed:', verifyPresetData.theme.version, verifyPresetData.layout.version);
  }

  // 6. Test Security (Hacker check)
  const hackerUpdate = await api('PATCH', '/tenant/storefront-customization', {
    theme: { ...verifyPresetData.theme, primaryColor: '#ff0000', script: '<script>alert("hacked")</script>', css: 'body { display: none !important; }' }
  }, token);
  
  const verifySecurity = await api('GET', '/tenant/storefront-customization', undefined, token);
  const verifySecurityData = verifySecurity.data;
  if (!verifySecurityData.theme.script && !verifySecurityData.theme.css) {
    console.log('✅ Security validation works (script/css removed)');
  } else {
    console.error('❌ Security validation failed - harmful fields found!', verifySecurityData.theme);
  }

  // 7. Test Background Image Fallback
  const updateBg = await api('PATCH', '/tenant/storefront-customization', {
    theme: { ...verifyPresetData.theme, backgroundImageUrl: 'https://images.com/bg.jpg', backgroundOverlay: 'invalid-mode' }
  }, token);
  
  const verifyBg = await api('GET', '/tenant/storefront-customization', undefined, token);
  if (verifyBg.data.theme.backgroundImageUrl === 'https://images.com/bg.jpg' && verifyBg.data.theme.backgroundOverlay === 'none') {
    console.log('✅ Background Image normalization works');
  } else {
    console.error('❌ Background Image normalization failed:', verifyBg.data.theme);
  }

  console.log('\nSMOKE TEST COMPLETED');
}

main().catch(console.error);
