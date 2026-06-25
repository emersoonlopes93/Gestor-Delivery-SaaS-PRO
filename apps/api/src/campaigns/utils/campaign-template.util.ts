function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVariableName(key: string) {
  const match = key.match(/^\{+([a-zA-Z0-9_]+)\}+$/);
  return match ? match[1] : key;
}

export function applyCampaignTemplate(template: string, variables: Record<string, string>) {
  let result = template;

  for (const [rawKey, rawValue] of Object.entries(variables)) {
    const key = normalizeVariableName(rawKey);
    const value = rawValue ?? '';
    const escapedKey = escapeRegExp(key);

    result = result.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
    result = result.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), value);
  }

  return result;
}
