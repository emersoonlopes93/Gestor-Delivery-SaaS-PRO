const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Iniciando validação de Stub Features e Gaps Críticos ---');

const agentsMdPath = path.join(__dirname, '..', 'AGENTS.md');
if (fs.existsSync(agentsMdPath)) {
  const content = fs.readFileSync(agentsMdPath, 'utf8');
  const betaStubMatch = content.match(/\*\*Beta \/ Stub:\*\* (.*)/);
  if (betaStubMatch) {
    const stubs = betaStubMatch[1].split(',').map(s => s.trim());
    console.log('Features marcadas como Beta/Stub:', stubs.join(', '));
  }
}

// Checar gaps conhecidos
const gapsPath = path.join(__dirname, '..', 'docs', 'product', 'known-gaps.md');
if (fs.existsSync(gapsPath)) {
  const gapsContent = fs.readFileSync(gapsPath, 'utf8');
  // Localiza linhas de tabela contendo "Crítica" ou "Alta"
  const criticalGaps = gapsContent.split('\n').filter(line => line.includes('|') && (line.includes('Crítica') || line.includes('Alta')));
  if (criticalGaps.length > 0) {
    console.log('\n[!] ATENÇÃO: Os seguintes gaps críticos ou de alta severidade estão registrados na base de conhecimento:');
    criticalGaps.forEach(g => console.log(`  ${g.trim()}`));
    console.log('\nPara builds de PR/CI, a resolução de items "Crítica" é recomendada antes do deploy em Produção.\n');
  }
}

// Checar o uso de NotImplementedException em controllers
const apiSrcDir = path.join(__dirname, '..', 'apps', 'api', 'src');
try {
  const grepOutput = execSync(`findstr /S /M "NotImplementedException" "${apiSrcDir}\\*.controller.ts"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  if (grepOutput) {
    const files = grepOutput.split('\n').map(f => f.trim()).filter(Boolean);
    console.log('ARQUIVOS COM NotImplementedException ENCONTRADOS:');
    files.forEach(f => console.log(`- ${f}`));
    console.log('\nAVISO: Assegure-se que esses módulos (ex: scheduling, kds) NÃO estão habilitados em presets de produção.');
  } else {
    console.log('Nenhum NotImplementedException encontrado em controllers.');
  }
} catch (e) {
  console.log('Nenhum NotImplementedException encontrado em controllers.');
}

console.log('--- Concluído ---');
