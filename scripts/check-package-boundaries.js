/**
 * Hardening Script: Architecture Boundaries Verification
 * This script ensures that shared packages and apps respect the architectural boundaries.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const BOUNDARIES = [
  {
    name: 'web-tenant',
    path: 'apps/web-tenant/src',
    forbidden: ['@gestor/storefront-ui'],
    message: 'web-tenant must not import @gestor/storefront-ui'
  },
  {
    name: 'web-admin',
    path: 'apps/web-admin/src',
    forbidden: ['@gestor/storefront-ui'],
    message: 'web-admin must not import @gestor/storefront-ui'
  },
  {
    name: 'web-storefront',
    path: 'apps/web-storefront/src',
    forbidden: ['@gestor/ui'],
    message: 'web-storefront must not import @gestor/ui'
  },
  {
    name: '@gestor/ui',
    path: 'packages/ui/src',
    forbidden: ['@gestor/storefront-ui', 'apps/web-tenant', 'apps/web-admin', 'apps/web-storefront'],
    message: '@gestor/ui must be isolated from storefront-ui and apps'
  },
  {
    name: '@gestor/storefront-preview',
    path: 'packages/storefront-preview/src',
    forbidden: ['@gestor/ui', '@gestor/storefront-ui', 'apps/web-tenant', 'apps/web-admin', 'apps/web-storefront'],
    message: '@gestor/storefront-preview must be isolated from app layers and storefront-ui'
  },
  {
    name: '@gestor/storefront-ui',
    path: 'packages/storefront-ui/src',
    forbidden: ['@gestor/ui', 'apps/web-tenant', 'apps/web-admin', 'apps/web-storefront'],
    message: '@gestor/storefront-ui must be isolated from @gestor/ui and apps'
  },
  {
    name: '@gestor/theme',
    path: 'packages/theme/src',
    forbidden: ['react', 'lucide-react', '@gestor/ui', '@gestor/storefront-ui', 'apps/'],
    message: '@gestor/theme must be pure logic and not depend on React or UI components'
  }
];

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

let violations = 0;

console.log('🔍 Checking architectural boundaries...\n');

BOUNDARIES.forEach(boundary => {
  const fullPath = path.join(ROOT_DIR, boundary.path);
  if (!fs.existsSync(fullPath)) return;

  const files = getAllFiles(fullPath);
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    boundary.forbidden.forEach(pkg => {
      // Match imports like: from '@gestor/ui' or import '@gestor/ui'
      const importRegex = new RegExp(`from ['"]${pkg}['"]|import ['"]${pkg}['"]|from ['"]${pkg}/|import ['"]${pkg}/`, 'g');
      if (importRegex.test(content)) {
        console.error(`❌ Violation in ${path.relative(ROOT_DIR, file)}: ${boundary.message}`);
        violations++;
      }
    });
  });
});

if (violations > 0) {
  console.error(`\n🚨 Found ${violations} boundary violations!`);
  process.exit(1);
} else {
  console.log('✅ All architectural boundaries are respected.');
  process.exit(0);
}
