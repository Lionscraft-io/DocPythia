/**
 * Password Authentication Utilities
 * Simple SHA256-based password hashing for admin authentication
 * Author: Wayne (2025-11-13)
 */

import crypto from 'crypto';

/**
 * Hash a password using SHA256
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  const inputHash = hashPassword(password);
  return inputHash === hash;
}

/**
 * Generate a secure random password
 */
export function generatePassword(length: number = 24): string {
  return crypto.randomBytes(Math.ceil(length * 3 / 4)).toString('base64').slice(0, length);
}
