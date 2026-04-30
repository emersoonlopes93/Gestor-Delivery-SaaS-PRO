const fs = require('fs');
const path = require('path');

const DIRECTORIES = [
  './src/features/pos',
  './src/features/cash'
];

const REPLACEMENTS = [
  // Backgrounds
  { regex: /(?<!dark:)bg-gray-950/g, replacement: 'bg-gray-50 dark:bg-gray-950' },
  { regex: /(?<!dark:)bg-gray-900\/50/g, replacement: 'bg-gray-50/50 dark:bg-gray-900/50' },
  { regex: /(?<!dark:)bg-gray-900\/30/g, replacement: 'bg-white/50 dark:bg-gray-900/30' },
  { regex: /(?<!dark:)bg-gray-900/g, replacement: 'bg-white dark:bg-gray-900' },
  
  { regex: /(?<!dark:)bg-gray-850\/30/g, replacement: 'bg-gray-50 dark:bg-gray-850/30' },
  { regex: /(?<!dark:)bg-gray-800\/60/g, replacement: 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800/80' },
  { regex: /(?<!dark:)bg-gray-800\/50/g, replacement: 'bg-gray-100 dark:bg-gray-800/50' },
  { regex: /(?<!dark:)bg-gray-800\/40/g, replacement: 'bg-white dark:bg-gray-800/40' },
  { regex: /(?<!dark:)bg-gray-800/g, replacement: 'bg-white dark:bg-gray-800' },
  
  { regex: /(?<!dark:)bg-gray-750/g, replacement: 'bg-gray-100 dark:bg-gray-750' },
  { regex: /(?<!dark:)bg-gray-700/g, replacement: 'bg-gray-100 dark:bg-gray-700' },
  
  // Borders
  { regex: /(?<!dark:)border-gray-900/g, replacement: 'border-gray-200 dark:border-gray-900' },
  { regex: /(?<!dark:)border-gray-800\/50/g, replacement: 'border-gray-200 dark:border-gray-800/50' },
  { regex: /(?<!dark:)border-gray-800/g, replacement: 'border-gray-200 dark:border-gray-800' },
  { regex: /(?<!dark:)border-gray-700/g, replacement: 'border-gray-200 dark:border-gray-700' },
  { regex: /(?<!dark:)border-gray-600/g, replacement: 'border-gray-300 dark:border-gray-600' },

  // Text
  { regex: /(?<!dark:)text-gray-100/g, replacement: 'text-gray-900 dark:text-gray-100' },
  { regex: /(?<!dark:)text-gray-200/g, replacement: 'text-gray-800 dark:text-gray-200' },
  { regex: /(?<!dark:)text-gray-300/g, replacement: 'text-gray-700 dark:text-gray-300' },
  { regex: /(?<!dark:)text-gray-400/g, replacement: 'text-gray-600 dark:text-gray-400' },
  { regex: /(?<!dark:)text-white/g, replacement: 'text-gray-900 dark:text-white' },

  // Hovers
  { regex: /(?<!dark:)hover:bg-gray-900/g, replacement: 'hover:bg-gray-100 dark:hover:bg-gray-900' },
  { regex: /(?<!dark:)hover:bg-gray-800/g, replacement: 'hover:bg-gray-50 dark:hover:bg-gray-800' },
  { regex: /(?<!dark:)hover:bg-gray-750/g, replacement: 'hover:bg-gray-100 dark:hover:bg-gray-750' },
  { regex: /(?<!dark:)hover:bg-gray-700/g, replacement: 'hover:bg-gray-100 dark:hover:bg-gray-700' },
  { regex: /(?<!dark:)hover:border-gray-700/g, replacement: 'hover:border-gray-300 dark:hover:border-gray-700' },
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  for (const { regex, replacement } of REPLACEMENTS) {
    content = content.replace(regex, replacement);
  }

  // Deduplicate
  content = content.replace(/dark:bg-gray-950 dark:bg-gray-950/g, 'dark:bg-gray-950');
  content = content.replace(/dark:bg-gray-900 dark:bg-gray-900/g, 'dark:bg-gray-900');
  content = content.replace(/dark:bg-gray-800 dark:bg-gray-800/g, 'dark:bg-gray-800');
  content = content.replace(/dark:border-gray-800 dark:border-gray-800/g, 'dark:border-gray-800');
  content = content.replace(/dark:text-white dark:text-white/g, 'dark:text-white');
  content = content.replace(/dark:text-gray-100 dark:text-gray-100/g, 'dark:text-gray-100');

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
console.log('Done fixing POS and Cash!');
