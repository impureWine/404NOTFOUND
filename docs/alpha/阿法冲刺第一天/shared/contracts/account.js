import { z } from 'zod';
import {
  isoInstantSchema,
  requestIdSchema,
  textByCodePoints,
  uuidSchema,
} from './common.js';

export const loginNameSchema = z
  .string()
  .transform((value) => value.normalize('NFKC'))
  .pipe(z.string().regex(/^[A-Za-z0-9_]{3,64}$/, '登录名须为3～64位字母、数字或下划线'))
  .transform((value) => value.toLowerCase());

export const newPasswordSchema = textByCodePoints({ min: 12, max: 128, label: '密码' });
export const loginPasswordSchema = textByCodePoints({ min: 1, max: 128, label: '密码' });

export const registerRequestSchema = z
  .strictObject({
    requestId: requestIdSchema,
    loginName: loginNameSchema,
    password: newPasswordSchema,
    confirmPassword: newPasswordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });

export const registerResponseSchema = z.strictObject({ accountId: uuidSchema });

export const loginTargetSchema = z.enum(['HOME', 'PROFILE', 'WORKSPACE']);
export const loginRequestSchema = z.strictObject({
  loginName: loginNameSchema,
  password: loginPasswordSchema,
  target: loginTargetSchema,
});

export const logoutRequestSchema = z.strictObject({});

export const changePasswordRequestSchema = z
  .strictObject({
    currentPassword: loginPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: newPasswordSchema,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的新密码不一致',
  });

export const authContextResponseSchema = z.strictObject({
  authenticated: z.boolean(),
  csrfToken: z.string().min(32).max(256),
  expiresAt: isoInstantSchema.optional(),
});
