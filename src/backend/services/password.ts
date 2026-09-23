import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const scryptOptions: ScryptOptions = { N: 16384, r: 8, p: 1 };

/**
 * Hashes a password with Node scrypt.
 * @param plain - Password to store. Callers already checked the length.
 * @returns `scrypt$<saltHex>$<hashHex>` using a 16-byte salt.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveKey(plain, salt, KEY_BYTES);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Compares a password to a stored scrypt hash.
 * @param plain - Password from the request.
 * @param stored - Stored `scrypt$<saltHex>$<hashHex>` value.
 * @returns True when the derived key matches. A malformed stored value is false.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const salt = readHex(parts[1] ?? '', SALT_BYTES);
  const expected = readHex(parts[2] ?? '');
  if (!salt || !expected) {
    return false;
  }

  const actual = await deriveKey(plain, salt, expected.length);
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

/**
 * Derives a scrypt key. Options match Node's defaults so stored hashes stay stable.
 * @param plain - Password bytes as a string.
 * @param salt - Salt buffer.
 * @param keyLength - Number of bytes to derive.
 * @returns The derived key.
 */
function deriveKey(plain: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, keyLength, scryptOptions, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

/**
 * Decodes a hex string of an expected length.
 * @param value - Hex text from the stored hash.
 * @param bytes - Required decoded length. Omit to allow any non-empty length.
 * @returns The buffer, or null when the text is not hex of that length.
 */
function readHex(value: string, bytes?: number): Buffer | null {
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, 'hex');
  if (bytes !== undefined && decoded.length !== bytes) {
    return null;
  }
  if (decoded.length === 0) {
    return null;
  }
  return decoded;
}
