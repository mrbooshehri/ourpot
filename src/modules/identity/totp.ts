import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';

export type EncryptedTotpSecret = { ciphertext: string; iv: string; tag: string };

export function createTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function encryptTotpSecret(secret: string, keyHex: string): EncryptedTotpSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptTotpSecret(encrypted: EncryptedTotpSecret, keyHex: string): string {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export function verifyTotpCode(secret: string, code: string, lastUsedStep: number | null, timestamp = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = OTPAuth.TOTP.validate({ token: code, secret: OTPAuth.Secret.fromBase32(secret), period: 30, window: 1, timestamp });
  if (delta === null) return null;
  const step = Math.floor(timestamp / 30_000) + delta;
  return lastUsedStep !== null && step <= lastUsedStep ? null : step;
}
