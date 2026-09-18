import { createHash } from 'node:crypto';

/**
 * SHA-256 of a value with object keys sorted, so two payloads that are
 * semantically identical hash the same regardless of key order (a client
 * re-serializing "the same" retry isn't guaranteed to preserve order).
 */
export function stableHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}
