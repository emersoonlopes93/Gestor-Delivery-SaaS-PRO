export function normalizeToolResponse(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { result: value };
  if (value === null || value === undefined) return { result: null };
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return { value };
  }
  if (t === 'object') {
    return sanitizePlainObject(value as Record<string, unknown>);
  }
  return { value: String(value) };
}

function sanitizePlainObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const key of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const v = obj[key];
    if (v === null || v === undefined) {
      out[key] = null;
      continue;
    }
    const vt = typeof v;
    if (vt === 'string' || vt === 'number' || vt === 'boolean') {
      out[key] = v;
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v.map((item) => {
        if (item === null || item === undefined) return null;
        const it = typeof item;
        if (it === 'string' || it === 'number' || it === 'boolean') return item;
        if (Array.isArray(item)) return item;
        if (it === 'object') return sanitizePlainObject(item as Record<string, unknown>);
        return String(item);
      });
      continue;
    }
    if (vt === 'object') {
      out[key] = sanitizePlainObject(v as Record<string, unknown>);
      continue;
    }
    out[key] = String(v);
  }
  return out;
}
