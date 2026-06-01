import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export type LoadedEnvFile = {
  path: string;
  loaded: boolean;
};

export function getApiRoot(): string {
  return resolve(__dirname, '..', '..');
}

export function getWorkspaceRoot(): string {
  return resolve(getApiRoot(), '..', '..');
}

export function getApiEnvFilePaths(): string[] {
  const apiRoot = getApiRoot();
  const workspaceRoot = getWorkspaceRoot();

  return [
    resolve(apiRoot, '.env.local'),
    resolve(apiRoot, '.env'),
    resolve(workspaceRoot, '.env.local'),
    resolve(workspaceRoot, '.env'),
  ];
}

export function loadApiEnvFiles(): LoadedEnvFile[] {
  const results: LoadedEnvFile[] = [];
  const resolvedFromFiles: Record<string, string> = {};

  for (const filePath of getApiEnvFilePaths().reverse()) {
    if (!existsSync(filePath)) {
      results.unshift({ path: filePath, loaded: false });
      continue;
    }

    const parsed = parseEnvFile(readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      resolvedFromFiles[key] = value;
    }
    results.unshift({ path: filePath, loaded: true });
  }

  for (const [key, value] of Object.entries(resolvedFromFiles)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return results;
}

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    parsed[key] = unquoteEnvValue(value);
  }

  return parsed;
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
