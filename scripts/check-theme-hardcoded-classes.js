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

// WARNING PATTERNS - reported but never block build
const WARNING_PATTERNS = [
  'disabled:opacity-50',
  'bg-transparent',
  'text-muted-foreground/50',
  'dark:text-gray-',
  'bg-gray-',
  'text-gray-',
  'border-gray-',
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
];

// File extensions to scan
const FILE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];

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

function main() {
  const args = process.argv.slice(2);
  const isCriticalMode = args.includes('--critical');
  const isReportMode = args.includes('--report');
  
  // Default to critical mode if no mode specified (e.g. check:theme fallback)
  const runCritical = isCriticalMode || (!isCriticalMode && !isReportMode);
  const runWarning = isReportMode;

  console.log('🔍 Scanning for hardcoded theme classes...');
  console.log(`Mode: ${runCritical ? 'CRITICAL' : ''} ${runWarning ? 'REPORT/WARNINGS' : ''}`);
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
  const filesWithWarningIssues = [];
  
  for (const file of filesToScan) {
    const { criticalIssues, warningIssues } = checkFile(file, runCritical, runWarning);
    
    if (criticalIssues.length > 0) {
      filesWithCriticalIssues.push({
        file,
        issues: criticalIssues,
      });
    }
    
    if (warningIssues.length > 0) {
      filesWithWarningIssues.push({
        file,
        issues: warningIssues,
      });
    }
  }
  
  // If no issues found
  if (filesWithCriticalIssues.length === 0 && filesWithWarningIssues.length === 0) {
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
    console.log('Critical patterns cause invisible text/elements in dark mode.');
    console.log('Please fix these issues or add allowlist comments:');
    console.log('  // @allow-theme-risk: clear justification here');
    console.log('');
  }
  
  // Report warning issues
  if (runWarning && filesWithWarningIssues.length > 0) {
    console.log('⚠️  WARNING ISSUES (should fix, but not blocking):');
    console.log('');
    
    for (const { file, issues } of filesWithWarningIssues) {
      console.log(`📄 ${file}`);
      
      for (const issue of issues) {
        console.log(`   Line ${issue.line}: ${issue.pattern}`);
        console.log(`   ${issue.content}`);
        console.log('');
      }
    }
    
    console.log('');
    console.log(`⚠️  Found ${filesWithWarningIssues.length} files with ${filesWithWarningIssues.reduce((sum, f) => sum + f.issues.length, 0)} WARNING issues.`);
    console.log('');
  }
  
  console.log('See docs/theme-guidelines.md for guidance.');
  console.log('');
  
  // Exit code logic
  if (runCritical && filesWithCriticalIssues.length > 0) {
    console.log('🚨 Build blocked due to CRITICAL theme issues.');
    process.exit(1);
  }
  
  if (runWarning && filesWithWarningIssues.length > 0) {
    console.log('⚠️  Warnings found. Build passes (non-blocking).');
    process.exit(0);
  }
}

main();
