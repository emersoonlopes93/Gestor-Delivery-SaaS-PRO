const fs = require('fs');
const path = require('path');

// CRITICAL PATTERNS - return exit code 1
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

// WARNING PATTERNS - return exit code 0 with warning
const WARNING_PATTERNS = [
  'disabled:opacity-50',
  'bg-transparent',
  'text-muted-foreground/50',
  'dark:text-gray-',
];

// Allowlist pattern for justified exceptions
const ALLOWLIST_PATTERN = '// @allow-theme-risk:';

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
      // Skip node_modules and similar
      if (!['node_modules', '.git', 'dist', 'build'].includes(file)) {
        scanDirectory(filePath, results);
      }
    } else if (FILE_EXTENSIONS.includes(path.extname(file))) {
      results.push(filePath);
    }
  }
  
  return results;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const criticalIssues = [];
  const warningIssues = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    // Check if line has allowlist comment
    if (line.includes(ALLOWLIST_PATTERN)) {
      continue; // Skip lines with allowlist comments
    }
    
    // Check for critical patterns
    for (const pattern of CRITICAL_PATTERNS) {
      if (line.includes(pattern)) {
        criticalIssues.push({
          line: lineNumber,
          pattern,
          content: line.trim(),
        });
      }
    }
    
    // Check for warning patterns
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
  
  return { criticalIssues, warningIssues };
}

function main() {
  console.log('🔍 Scanning for hardcoded theme classes...');
  console.log('');
  
  const allFiles = [];
  
  for (const dir of DIRECTORIES_TO_SCAN) {
    if (fs.existsSync(dir)) {
      const files = scanDirectory(dir);
      allFiles.push(...files);
    }
  }
  
  console.log(`📁 Scanning ${allFiles.length} files...`);
  console.log('');
  
  const filesWithCriticalIssues = [];
  const filesWithWarningIssues = [];
  
  for (const file of allFiles) {
    const { criticalIssues, warningIssues } = checkFile(file);
    
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
  
  if (filesWithCriticalIssues.length === 0 && filesWithWarningIssues.length === 0) {
    console.log('✅ No hardcoded theme classes found!');
    console.log('');
    console.log('All files are compliant with theme guidelines.');
    process.exit(0);
  }
  
  // Report critical issues
  if (filesWithCriticalIssues.length > 0) {
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
  if (filesWithWarningIssues.length > 0) {
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
  
  // Exit with error code if there are critical issues
  if (filesWithCriticalIssues.length > 0) {
    console.log('🚨 Build blocked due to CRITICAL theme issues.');
    process.exit(1);
  }
  
  // Exit with success if only warnings
  if (filesWithWarningIssues.length > 0) {
    console.log('⚠️  Build passes with theme warnings (non-blocking).');
    process.exit(0);
  }
}

main();
