const fs = require('fs');
const path = require('path');

const DIRECTORIES = [
  './src/features',
  './src/components',
  './src/layouts'
];

const REPLACEMENTS = [
  { regex: /(?<!dark:)bg-white/g, replacement: 'bg-white dark:bg-gray-900' },
  { regex: /(?<!dark:)bg-gray-50/g, replacement: 'bg-gray-50 dark:bg-gray-900/50' },
  { regex: /(?<!dark:)text-gray-900/g, replacement: 'text-gray-900 dark:text-gray-100' },
  { regex: /(?<!dark:)text-gray-800/g, replacement: 'text-gray-800 dark:text-gray-200' },
  { regex: /(?<!dark:)text-gray-700/g, replacement: 'text-gray-700 dark:text-gray-300' },
  { regex: /(?<!dark:)text-gray-600/g, replacement: 'text-gray-600 dark:text-gray-400' },
  { regex: /(?<!dark:)text-gray-500/g, replacement: 'text-gray-500 dark:text-gray-400' },
  { regex: /(?<!dark:)border-gray-100/g, replacement: 'border-gray-100 dark:border-gray-800' },
  { regex: /(?<!dark:)border-gray-200/g, replacement: 'border-gray-200 dark:border-gray-800' },
  { regex: /(?<!dark:)border-gray-300/g, replacement: 'border-gray-300 dark:border-gray-700' },
  { regex: /(?<!dark:)divide-gray-100/g, replacement: 'divide-gray-100 dark:divide-gray-800' },
  { regex: /(?<!dark:)divide-gray-200/g, replacement: 'divide-gray-200 dark:divide-gray-800' },
  { regex: /(?<!dark:)hover:bg-gray-50/g, replacement: 'hover:bg-gray-50 dark:hover:bg-gray-800' },
  { regex: /(?<!dark:)hover:bg-gray-100/g, replacement: 'hover:bg-gray-100 dark:hover:bg-gray-800' }
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  for (const { regex, replacement } of REPLACEMENTS) {
    content = content.replace(regex, replacement);
  }

  // Deduplicate if any class got added multiple times
  // e.g., "bg-white dark:bg-gray-900 dark:bg-gray-900"
  content = content.replace(/dark:bg-gray-900 dark:bg-gray-900/g, 'dark:bg-gray-900');
  content = content.replace(/dark:text-gray-100 dark:text-gray-100/g, 'dark:text-gray-100');
  content = content.replace(/dark:border-gray-800 dark:border-gray-800/g, 'dark:border-gray-800');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated: ${filePath}`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

DIRECTORIES.forEach(dir => walkDir(path.resolve(__dirname, dir)));
console.log('Done!');
