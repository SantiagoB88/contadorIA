import { z } from 'zod';

/**
 * Wraps an optional field so an empty string is treated the same as "not
 * provided". Necessary because HTML form inputs (and react-hook-form's
 * uncontrolled `register()`) submit an untouched optional field as `''`,
 * never `undefined` — without this, `z.string().email().optional()` still
 * rejects that `''` as an invalid email instead of treating it as absent.
 */
export function optionalText<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}
