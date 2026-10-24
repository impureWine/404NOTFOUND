import { z } from 'zod';

export const codePointLength = (value) => Array.from(value).length;

export const textByCodePoints = ({ min = 0, max, label = '文本', trim = false }) => {
  let schema = z.string();
  if (trim) schema = schema.trim();
  return schema.superRefine((value, context) => {
    const length = codePointLength(value);
    if (length < min || length > max) {
      context.addIssue({
        code: 'custom',
        message: `${label}长度必须为 ${min}～${max} 个 Unicode 码点`,
      });
    }
  });
};

export const uuidSchema = z.uuid().refine(
  (value) => value !== '00000000-0000-0000-0000-000000000000',
  'ID 不能是全零 UUID',
);

export const requestIdSchema = uuidSchema;
export const generationSchema = z.int().min(0);
export const positiveVersionSchema = z.int().positive();
export const isoInstantSchema = z.iso.datetime({ offset: true });

export const selectedContextIdsSchema = z
  .array(uuidSchema)
  .max(20)
  .refine((items) => new Set(items).size === items.length, '上下文 ID 不能重复');

export const responseMetaSchema = z.strictObject({ requestId: uuidSchema });

export const successEnvelope = (dataSchema) =>
  z.strictObject({ data: dataSchema, meta: responseMetaSchema });
