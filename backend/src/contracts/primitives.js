import { z } from 'zod';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export const nonZeroUuidSchema = z.string().uuid().refine(
  (value) => value.toLowerCase() !== ZERO_UUID,
  'UUID must not be all zeroes',
);

export const requestIdSchema = nonZeroUuidSchema;

export function codePointString({ min = 0, max, trim = false, name = 'text' }) {
  return z.string().superRefine((value, context) => {
    const normalized = trim ? value.trim() : value;
    const length = Array.from(normalized).length;
    if (length < min || length > max) {
      context.addIssue({
        code: 'custom',
        message: `${name} must contain ${min}-${max} Unicode code points`,
      });
    }
  }).transform((value) => (trim ? value.trim() : value));
}

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  // ISO parsing preserves years 0001–0099; Date.UTC treats them as 1901–1999.
  // PostgreSQL has no year zero.
  const date = new Date(`${value}T00:00:00Z`);
  return !value.startsWith('0000-') && !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value;
}, 'date must be a real calendar date');

export const instantSchema = z.string().datetime({ offset: true });

export const ianaTimeZoneSchema = codePointString({
  min: 1,
  max: 64,
  trim: true,
  name: 'timeZone',
}).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'timeZone must be a supported IANA time zone');
