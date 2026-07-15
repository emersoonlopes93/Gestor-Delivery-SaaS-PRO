const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Iniciando validação de Stub Features ---');

// Features que estão como "stable" ou "enabled" no frontend/backend mas não deveriam:
// Ler o AGENTS.md para obter a lista de Stubs validada
const agentsMdPath = path.join(__dirname, '..', 'AGENTS.md');
const content = fs.readFileSync(agentsMdPath, 'utf8');

const betaStubMatch = content.match(/\*\*Beta \/ Stub:\*\* (.*)/);
if (!betaStubMatch) {
  console.log('Não foi possível ler as features Beta/Stub do AGENTS.md');
  process.exit(0);
}

const stubs = betaStubMatch[1].split(',').map(s => s.trim());
console.log('Features marcadas como Beta/Stub:', stubs.join(', '));

// Checar o uso de NotImplementedException em controllers
const apiSrcDir = path.join(__dirname, '..', 'apps', 'api', 'src');
try {
  // grep recursively for NotImplementedException
  const grepOutput = execSync(`findstr /S /M "NotImplementedException" "${apiSrcDir}\\*.controller.ts"`, { encoding: 'utf8' }).trim();
  
  if (grepOutput) {
    const files = grepOutput.split('\n').map(f => f.trim()).filter(Boolean);
    console.log('\nARQUIVOS COM NotImplementedException ENCONTRADOS:');
    files.forEach(f => console.log(`- ${f}`));
    console.log('\nAVISO: Assegure-se que esses módulos (ex: scheduling, kds) NÃO estão habilitados em presets de produção.');
  } else {
    console.log('Nenhum NotImplementedException encontrado em controllers.');
  }
} catch (e) {
  // findstr returns error if no match found
  console.log('Nenhum NotImplementedException encontrado em controllers.');
}

console.log('--- Concluído ---');
