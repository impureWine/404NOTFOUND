import { createHash } from 'node:crypto';

function normalize(value) {
  if (value instanceof Uint8Array) {
    return { $bytes: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalize(nestedValue)]),
    );
  }
  return value;
}

export function stableHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)), 'utf8')
    .digest();
}
