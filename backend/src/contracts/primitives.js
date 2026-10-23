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
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
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
