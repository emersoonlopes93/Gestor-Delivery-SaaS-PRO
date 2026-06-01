const fs = require('fs');
const path = require('path');

// CRITICAL PATTERNS - return exit code 1 in --critical mode
const CRITICAL_PATTERNS = [
  'text-transparent',
  'dark:text-black',
  'dark:text-gray-900',
  'dark:text-slate-900',
  'text-muted-foreground/30',
  'text-muted-foreground/40',
  'opacity-20',
  'opacity-30',
  'opacity-40',
];

// WARNING PATTERNS - reported but never block build unless --baseline is active
const WARNING_PATTERNS = [
  'disabled:opacity-50',
  'bg-transparent',
  'text-muted-foreground/50',
  'dark:text-gray-',
  'bg-gray-',
  'text-gray-',
  'border-gray-',
  'bg-white',
  'dark:bg-gray-',
  'dark:bg-slate-',
];

// Allowlist pattern for justified exceptions
const ALLOWLIST_PATTERN = '// @allow-theme-risk:';

// Legacy files to exclude from theme validation
const EXCLUDED_FILES = [
  'DeliveryZonesPage.tsx',
  'DeliveryZonesPageV2.tsx',
];

// Directories to scan
const DIRECTORIES_TO_SCAN = [
  'apps/web-tenant/src',
  'apps/web-admin/src',
  'apps/web-storefront/src',
  'packages/ui/src',
  'packages/storefront-ui/src',
];

// File extensions to scan
const FILE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];

// Path to baseline JSON
const BASELINE_FILE_PATH = path.join(__dirname, '..', 'theme-warnings-baseline.json');

function scanDirectory(dir, results = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build'].includes(file)) {
        scanDirectory(filePath, results);
      }
    } else if (FILE_EXTENSIONS.includes(path.extname(file))) {
      results.push(filePath);
    }
  }
  
  return results;
}

function checkFile(filePath, checkCritical, checkWarning) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const criticalIssues = [];
  const warningIssues = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    // Check if line has allowlist comment
    if (line.includes(ALLOWLIST_PATTERN)) {
      continue;
    }
    
    // Check for critical patterns
    if (checkCritical) {
      for (const pattern of CRITICAL_PATTERNS) {
        if (line.includes(pattern)) {
          criticalIssues.push({
            line: lineNumber,
            pattern,
            content: line.trim(),
          });
        }
      }
    }
    
    // Check for warning patterns
    if (checkWarning) {
      for (const pattern of WARNING_PATTERNS) {
        if (line.includes(pattern)) {
          warningIssues.push({
            line: lineNumber,
            pattern,
            content: line.trim(),
          });
        }
      }
    }
  }
  
  return { criticalIssues, warningIssues };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE_PATH, 'utf-8'));
  } catch (err) {
    console.error('⚠️ Failed to parse baseline file. Treating as empty.', err);
    return [];
  }
}

function writeBaseline(warnings) {
  const formattedWarnings = warnings.map(w => ({
    file: path.relative(path.join(__dirname, '..'), w.file).replace(/\\/g, '/'),
    line: w.line,
    pattern: w.pattern,
    content: w.content,
    category: 'warning',
    date: new Date().toISOString().split('T')[0]
  }));
  
  fs.writeFileSync(BASELINE_FILE_PATH, JSON.stringify(formattedWarnings, null, 2), 'utf-8');
  console.log(`✅ Baseline successfully updated in ${BASELINE_FILE_PATH}`);
  console.log(`Mappeado total de ${formattedWarnings.length} warnings.`);
}

function main() {
  const args = process.argv.slice(2);
  const isCriticalMode = args.includes('--critical');
  const isReportMode = args.includes('--report');
  const isBaselineMode = args.includes('--baseline');
  const shouldWriteBaseline = args.includes('--write-baseline');
  
  // Default to critical mode if no mode specified
  const runCritical = isCriticalMode || (!isCriticalMode && !isReportMode && !isBaselineMode && !shouldWriteBaseline);
  const runWarning = isReportMode || isBaselineMode || shouldWriteBaseline;

  console.log('🔍 Scanning for hardcoded theme classes...');
  console.log(`Mode: ${runCritical ? 'CRITICAL' : ''} ${runWarning ? 'WARNINGS' : ''} ${isBaselineMode ? '(BASELINE COMPARISON)' : ''}`);
  console.log('');
  
  const allFiles = [];
  
  for (const dir of DIRECTORIES_TO_SCAN) {
    if (fs.existsSync(dir)) {
      const files = scanDirectory(dir);
      allFiles.push(...files);
    }
  }
  
  // Filter out excluded files
  const filesToScan = allFiles.filter(file => {
    const basename = path.basename(file);
    return !EXCLUDED_FILES.includes(basename);
  });
  
  console.log(`📁 Scanning ${filesToScan.length} files... (Excluded ${allFiles.length - filesToScan.length} legacy/backup files)`);
  console.log('');
  
  const filesWithCriticalIssues = [];
  const allWarnings = [];
  
  for (const file of filesToScan) {
    const { criticalIssues, warningIssues } = checkFile(file, runCritical, runWarning);
    
    if (criticalIssues.length > 0) {
      filesWithCriticalIssues.push({
        file,
        issues: criticalIssues,
      });
    }
    
    if (warningIssues.length > 0) {
      for (const issue of warningIssues) {
        allWarnings.push({
          file,
          ...issue
        });
      }
    }
  }
  
  // 1. Write baseline mode
  if (shouldWriteBaseline) {
    writeBaseline(allWarnings);
    process.exit(0);
  }
  
  // 2. Baseline comparison mode
  if (isBaselineMode) {
    const baseline = loadBaseline();
    const newWarnings = [];
    
    for (const w of allWarnings) {
      const relativePath = path.relative(path.join(__dirname, '..'), w.file).replace(/\\/g, '/');
      const isKnown = baseline.some(b => 
        b.file === relativePath && 
        b.pattern === w.pattern && 
        b.content === w.content
      );
      
      if (!isKnown) {
        newWarnings.push(w);
      }
    }
    
    if (newWarnings.length > 0) {
      console.log('❌ NEW WARNINGS INTRODUCED (not present in baseline):');
      console.log('');
      
      for (const w of newWarnings) {
        console.log(`📄 ${w.file}`);
        console.log(`   Line ${w.line}: ${w.pattern}`);
        console.log(`   ${w.content}`);
        console.log('');
      }
      
      console.log(`🚨 Build blocked: Found ${newWarnings.length} new theme warnings outside baseline.`);
      console.log('To update the baseline, run: pnpm check:theme:write-baseline');
      console.log('');
      process.exit(1);
    } else {
      console.log('✅ Baseline verification passed! No new warnings introduced.');
      console.log(`Total active warnings in baseline: ${allWarnings.length}`);
      process.exit(0);
    }
  }
  
  // If no issues found in normal run
  if (filesWithCriticalIssues.length === 0 && allWarnings.length === 0) {
    console.log('✅ No hardcoded theme issues found in selected mode!');
    process.exit(0);
  }
  
  // Report critical issues
  if (runCritical && filesWithCriticalIssues.length > 0) {
    console.log('❌ CRITICAL ISSUES (must fix):');
    console.log('');
    
    for (const { file, issues } of filesWithCriticalIssues) {
      console.log(`📄 ${file}`);
      
      for (const issue of issues) {
        console.log(`   Line ${issue.line}: ${issue.pattern}`);
        console.log(`   ${issue.content}`);
        console.log('');
      }
    }
    
    console.log('');
    console.log(`❌ Found ${filesWithCriticalIssues.length} files with ${filesWithCriticalIssues.reduce((sum, f) => sum + f.issues.length, 0)} CRITICAL issues.`);
    console.log('');
    process.exit(1);
  }
  
  // Report warning issues in standard report mode
  if (isReportMode && allWarnings.length > 0) {
    console.log('⚠️  WARNING ISSUES (should fix, but not blocking):');
    console.log('');
    
    // Group warnings by file to print cleanly
    const grouped = {};
    for (const w of allWarnings) {
      if (!grouped[w.file]) grouped[w.file] = [];
      grouped[w.file].push(w);
    }
    
    for (const file of Object.keys(grouped)) {
      console.log(`📄 ${file}`);
      for (const w of grouped[file]) {
        console.log(`   Line ${w.line}: ${w.pattern}`);
        console.log(`   ${w.content}`);
      }
      console.log('');
    }
    
    console.log(`⚠️  Found ${allWarnings.length} WARNING issues.`);
    console.log('See docs/theme-guidelines.md for guidance.');
    console.log('');
    process.exit(0);
  }
}

main();
