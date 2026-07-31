const fs = require('fs');
const path = require('path');

const config = fs.readFileSync(path.join(__dirname, '..', '.gitleaks.toml'), 'utf8');
const match = config.match(/id = "gestor-jwt-env-assignment"[\s\S]*?regex = '''(.*?)'''/);

if (!match) {
  throw new Error('The JWT secret-scanning rule is missing.');
}

const detector = new RegExp(match[1].replace('(?i)', ''), 'i');
const key = ['JWT', 'SECRET'].join('_');
const controlledSyntheticValue = 'syntheticScannerNegativeTestOnly1234567890';

if (!detector.test(`${key}=${controlledSyntheticValue}`)) {
  throw new Error('The JWT secret-scanning rule did not detect the controlled synthetic pattern.');
}

console.log('Controlled synthetic secret-scanning negative test passed.');
