import crypto from 'crypto';
import { config } from '../config/env.js';

// const ENCRYPTION_KEY = Buffer.from(config.PHONE_KEY, 'hex');

export function encryptPhoneNumber(plaintext: string): string {
  const secret = config.PHONE_KEY;

  if (!secret) {
    throw new Error('PHONE_SECRET missing');
  }

  const ENCRYPTION_KEY = Buffer.from(secret, 'hex');

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decryptPhoneNumber(ciphertext: string): string {
  const secret = config.PHONE_KEY;

  if (!secret) {
    throw new Error('PHONE_SECRET missing');
  }

  const ENCRYPTION_KEY = Buffer.from(secret, 'hex');
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
