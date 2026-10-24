import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest();

export const hashPassword = (password) => hash(password, ARGON2_OPTIONS);

export const verifyPassword = async (digest, password) => {
  try {
    return await verify(digest, password);
  } catch {
    return false;
  }
};

export function parseProfileKey(value) {
  const key = Buffer.from(value ?? '', 'base64');
  if (key.byteLength !== 32) {
    throw new Error('PROFILE_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
  }
  return key;
}

export function encryptProfileText(value, key) {
  if (!value) return null;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptProfileText(value, key) {
  if (!value) return '';
  const payload = Buffer.from(value);
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
