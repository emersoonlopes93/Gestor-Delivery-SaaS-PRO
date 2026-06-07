import { spawn } from 'child_process';

const child = spawn('npx', ['prisma', 'migrate', 'dev', '--name', 'add_fractional_pricing_v3'], {
  shell: true,
  cwd: 'c:\\Users\\Emerson\\Documents\\GitHub\\Gestor-Delivery-SaaS-PRO\\apps\\api',
});

child.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('[STDOUT]', output);
  if (output.includes('Do you want to continue?') || output.includes('different from the local database name') || output.includes('y/N')) {
    console.log('--- Responding with "y" ---');
    child.stdin.write('y\n');
  }
});

child.stderr.on('data', (data) => {
  console.error('[STDERR]', data.toString());
});

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});
