/**
 * Password Authentication Utilities Tests
 * Tests for SHA256-based password hashing
 * Owner: Wayne
 * Date: 2025-12-23
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generatePassword } from '../server/auth/password.js';

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should hash a password to a 64-character hex string', () => {
      const password = 'testPassword123';
      const hash = hashPassword(password);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce consistent hashes for the same password', () => {
      const password = 'consistentPassword';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different passwords', () => {
      const hash1 = hashPassword('password1');
      const hash2 = hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashPassword('');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should handle special characters', () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = hashPassword(password);

      expect(hash).toHaveLength(64);
    });

    it('should handle unicode characters', () => {
      const password = '密码123';
      const hash = hashPassword(password);

      expect(hash).toHaveLength(64);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', () => {
      const password = 'correctPassword';
      const hash = hashPassword(password);

      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('should return false for incorrect password', () => {
      const password = 'correctPassword';
      const hash = hashPassword(password);

      expect(verifyPassword('wrongPassword', hash)).toBe(false);
    });

    it('should return false for similar but different passwords', () => {
      const password = 'Password123';
      const hash = hashPassword(password);

      expect(verifyPassword('password123', hash)).toBe(false); // Case difference
      expect(verifyPassword('Password123 ', hash)).toBe(false); // Extra space
      expect(verifyPassword('Password124', hash)).toBe(false); // One digit different
    });

    it('should handle empty password verification', () => {
      const hash = hashPassword('');

      expect(verifyPassword('', hash)).toBe(true);
      expect(verifyPassword('anything', hash)).toBe(false);
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
