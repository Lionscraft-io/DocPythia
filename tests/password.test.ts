/**
 * Password Authentication Utilities Tests
 * Tests for bcrypt-based password hashing
 * Owner: Wayne
 * Date: 2025-12-23
 */

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashPasswordSync,
  verifyPasswordSync,
  generatePassword,
  isLegacyHash,
} from '../server/auth/password.js';

describe('Password Utilities', () => {
  describe('hashPasswordSync', () => {
    it('should hash a password to a bcrypt format string', () => {
      const password = 'testPassword123';
      const hash = hashPasswordSync(password);

      // Bcrypt hashes start with $2a$ or $2b$ and are 60 characters
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    });

    it('should produce different hashes for the same password (salted)', () => {
      const password = 'consistentPassword';
      const hash1 = hashPasswordSync(password);
      const hash2 = hashPasswordSync(password);

      // Bcrypt uses random salt, so hashes should differ
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashPasswordSync('');

      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    });

    it('should handle special characters', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = hashPasswordSync(password);

      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    });

    it('should handle unicode characters', () => {
      const password = '密码123';
      const hash = hashPasswordSync(password);

      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    });
  });

  describe('hashPassword (async)', () => {
    it('should hash a password asynchronously', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    });
  });

  describe('verifyPasswordSync', () => {
    it('should return true for correct password', () => {
      const password = 'correctPassword';
      const hash = hashPasswordSync(password);

      expect(verifyPasswordSync(password, hash)).toBe(true);
    });

    it('should return false for incorrect password', () => {
      const password = 'correctPassword';
      const hash = hashPasswordSync(password);

      expect(verifyPasswordSync('wrongPassword', hash)).toBe(false);
    });

    it('should return false for similar but different passwords', () => {
      const password = 'Password123';
      const hash = hashPasswordSync(password);

      expect(verifyPasswordSync('password123', hash)).toBe(false); // Case difference
      expect(verifyPasswordSync('Password123 ', hash)).toBe(false); // Extra space
      expect(verifyPasswordSync('Password124', hash)).toBe(false); // One digit different
    });

    it('should handle empty password verification', () => {
      const hash = hashPasswordSync('');

      expect(verifyPasswordSync('', hash)).toBe(true);
      expect(verifyPasswordSync('anything', hash)).toBe(false);
    });
  });

  describe('verifyPassword (async)', () => {
    it('should verify password asynchronously', async () => {
      const password = 'asyncPassword';
      const hash = await hashPassword(password);

      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });
  });

  describe('Legacy SHA256 Hash Support', () => {
    it('should identify legacy SHA256 hash', () => {
      // SHA256 produces 64-character hex string
      const legacyHash = 'a'.repeat(64);
      expect(isLegacyHash(legacyHash)).toBe(true);
    });

    it('should identify bcrypt hash as non-legacy', () => {
      const bcryptHash = hashPasswordSync('test');
      expect(isLegacyHash(bcryptHash)).toBe(false);
    });

    it('should verify password against legacy SHA256 hash', () => {
      // Create a real SHA256 hash of "testPassword"
      const crypto = require('crypto');
      const password = 'testPassword';
      const legacyHash = crypto.createHash('sha256').update(password).digest('hex');

      expect(verifyPasswordSync(password, legacyHash)).toBe(true);
      expect(verifyPasswordSync('wrongPassword', legacyHash)).toBe(false);
    });
  });

  describe('generatePassword', () => {
    it('should generate password of default length (24)', () => {
      const password = generatePassword();

      expect(password.length).toBe(24);
    });

    it('should generate password of specified length', () => {
      expect(generatePassword(12).length).toBe(12);
      expect(generatePassword(32).length).toBe(32);
      expect(generatePassword(48).length).toBe(48);
    });

    it('should generate base64-safe characters', () => {
      const password = generatePassword(100);

      // Base64 characters are alphanumeric plus + and /
      expect(password).toMatch(/^[A-Za-z0-9+/]+$/);
    });

    it('should generate unique passwords', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 100; i++) {
        passwords.add(generatePassword());
      }

      // All 100 passwords should be unique
      expect(passwords.size).toBe(100);
    });

    it('should handle minimum length', () => {
      const password = generatePassword(1);

      expect(password.length).toBe(1);
    });
  });
});
