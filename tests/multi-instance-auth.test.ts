/**
 * Multi-Instance Authentication Tests
 * Tests for instance-based authentication
 * Owner: Wayne
 * Date: 2025-12-23
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPasswordSync } from '../server/auth/password.js';

// Mock the InstanceConfigLoader
vi.mock('../server/config/instance-loader.js', () => ({
  InstanceConfigLoader: {
    getAvailableInstances: vi.fn(),
    has: vi.fn(),
    get: vi.fn(),
    load: vi.fn(),
  },
}));

import { InstanceConfigLoader } from '../server/config/instance-loader.js';
import {
  authenticateAnyInstance,
  authenticateInstance,
} from '../server/auth/multi-instance-auth.js';

describe('Multi-Instance Authentication', () => {
  const testPassword = 'testPassword123';
  const testPasswordHash = hashPasswordSync(testPassword);

  const mockConfig = {
    admin: {
      passwordHash: testPasswordHash,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticateAnyInstance', () => {
    it('should return error when no instances are configured', async () => {
      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([]);

      const result = await authenticateAnyInstance(testPassword);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No instances configured');
    });

    it('should authenticate against matching instance', async () => {
      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'projecta',
        'projectb',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);

      const result = await authenticateAnyInstance(testPassword);

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe('projecta');
    });

    it('should try all instances until match found', async () => {
      const wrongConfig = {
        admin: {
          passwordHash: hashPasswordSync('wrongPassword'),
        },
      };

      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'wrong1',
        'wrong2',
        'correct',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockImplementation((id: string) => {
        if (id === 'correct') return mockConfig as any;
        return wrongConfig as any;
      });

      const result = await authenticateAnyInstance(testPassword);

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe('correct');
    });

    it('should return error when no instance matches', async () => {
      const wrongConfig = {
        admin: {
          passwordHash: hashPasswordSync('wrongPassword'),
        },
      };

      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'instance1',
        'instance2',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockReturnValue(wrongConfig as any);

      const result = await authenticateAnyInstance(testPassword);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should load config if not cached', async () => {
      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'uncached',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
      vi.mocked(InstanceConfigLoader.load).mockReturnValue(mockConfig as any);

      const result = await authenticateAnyInstance(testPassword);

      expect(InstanceConfigLoader.load).toHaveBeenCalledWith('uncached');
      expect(result.success).toBe(true);
    });

    it('should continue to next instance on config load error', async () => {
      vi.mocked(InstanceConfigLoader.getAvailableInstances).mockReturnValue([
        'broken',
        'working',
      ]);
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
      vi.mocked(InstanceConfigLoader.load).mockImplementation((id: string) => {
        if (id === 'broken') throw new Error('Config not found');
        return mockConfig as any;
      });

      const result = await authenticateAnyInstance(testPassword);

      expect(result.success).toBe(true);
      expect(result.instanceId).toBe('working');
    });
  });

  describe('authenticateInstance', () => {
    it('should return true for valid password', () => {
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);

      const result = authenticateInstance(testPassword, 'test');

      expect(result).toBe(true);
    });

    it('should return false for invalid password', () => {
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(true);
      vi.mocked(InstanceConfigLoader.get).mockReturnValue(mockConfig as any);

      const result = authenticateInstance('wrongPassword', 'test');

      expect(result).toBe(false);
    });

    it('should load config if not cached', () => {
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
      vi.mocked(InstanceConfigLoader.load).mockReturnValue(mockConfig as any);

      const result = authenticateInstance(testPassword, 'test');

      expect(InstanceConfigLoader.load).toHaveBeenCalledWith('test');
      expect(result).toBe(true);
    });

    it('should return false on config error', () => {
      vi.mocked(InstanceConfigLoader.has).mockReturnValue(false);
      vi.mocked(InstanceConfigLoader.load).mockImplementation(() => {
        throw new Error('Config not found');
      });

      const result = authenticateInstance(testPassword, 'nonexistent');

      expect(result).toBe(false);
    });
  });
});
