import { 
  sanitizeHexColor, 
  getDefaultStorefrontThemeSettings,
  getDefaultStorefrontLayoutSettings,
  getStorefrontPresets,
  getStorefrontPresetById,
  StorefrontPreset,
  normalizeStorefrontTheme,
  normalizeStorefrontLayout
} from './index';

declare const process: any;

const results: { name: string; passed: boolean; error?: string }[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message });
    console.log(`❌ ${name}: ${e.message}`);
  }
}

function expect(val: any) {
  return {
    toBe: (expected: any) => {
      if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`);
    },
    toContain: (expected: any) => {
      if (!Array.isArray(val) || !val.includes(expected)) throw new Error(`Expected array to contain ${expected}`);
    },
    toBeDefined: () => {
      if (val === undefined || val === null) throw new Error(`Expected value to be defined`);
    },
    toBeUndefined: () => {
      if (val !== undefined) throw new Error(`Expected value to be undefined`);
    }
  };
}

console.log('RUNNING UNIT TESTS: @gestor/theme');

test('sanitizeHexColor validates hex', () => {
  expect(sanitizeHexColor('#ffffff')).toBe('#ffffff');
  expect(sanitizeHexColor('#000')).toBe('#000');
});

test('sanitizeHexColor fallbacks for invalid', () => {
  const fallback = '#0c93e9';
  expect(sanitizeHexColor('invalid')).toBe(fallback);
  expect(sanitizeHexColor(null)).toBe(fallback);
});

test('presets versioning', () => {
  const presets = getStorefrontPresets();
  presets.forEach((p: StorefrontPreset) => {
    expect(p.theme.version).toBe(1);
    expect(p.layout.version).toBe(1);
  });
});

test('getStorefrontPresetById', () => {
  const preset = getStorefrontPresetById('fast-food');
  expect(preset).toBeDefined();
  expect(preset?.id).toBe('fast-food');
  
  const invalid = getStorefrontPresetById('non-existent');
  expect(invalid).toBeUndefined();
});

test('defaults have version', () => {
  expect(getDefaultStorefrontThemeSettings().version).toBe(1);
  expect(getDefaultStorefrontLayoutSettings().version).toBe(1);
});

test('normalizeStorefrontTheme hardening', () => {
  const defaults = getDefaultStorefrontThemeSettings();
  
  // Case: Empty/Invalid input
  expect(normalizeStorefrontTheme(null).primaryColor).toBe(defaults.primaryColor);
  expect(normalizeStorefrontTheme({}).primaryColor).toBe(defaults.primaryColor);
  
  // Case: Invalid color
  expect(normalizeStorefrontTheme({ primaryColor: 'hack-red' }).primaryColor).toBe(defaults.primaryColor);
  
  // Case: Invalid enum
  expect(normalizeStorefrontTheme({ colorMode: 'hacker-mode' }).colorMode).toBe(defaults.colorMode);
  
  // Case: Valid manual input
  expect(normalizeStorefrontTheme({ colorMode: 'dark', primaryColor: '#ff0000' }).colorMode).toBe('dark');
  expect(normalizeStorefrontTheme({ colorMode: 'dark', primaryColor: '#ff0000' }).primaryColor).toBe('#ff0000');
});

test('normalizeStorefrontLayout hardening', () => {
  const defaults = getDefaultStorefrontLayoutSettings();
  
  // Case: Invalid enum
  expect(normalizeStorefrontLayout({ productLayout: 'ultra-wide' }).productLayout).toBe(defaults.productLayout);
  
  // Case: Invalid types (hacker payload)
  expect(normalizeStorefrontLayout({ heroEnabled: 'yes-please' }).heroEnabled).toBe(defaults.heroEnabled);
  expect(normalizeStorefrontLayout({ showBadges: 1 }).showBadges).toBe(defaults.showBadges);
  
  // Case: Valid manual input
  expect(normalizeStorefrontLayout({ productLayout: 'compact', heroEnabled: false }).productLayout).toBe('compact');
  expect(normalizeStorefrontLayout({ productLayout: 'compact', heroEnabled: false }).heroEnabled).toBe(false);
});

const failed = results.filter(r => !r.passed);
if (failed.length > 0) {
  console.log(`\nTests failed: ${failed.length}`);
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
  process.exit(0);
}
