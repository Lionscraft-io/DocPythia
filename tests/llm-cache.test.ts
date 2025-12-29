/**
 * LLM Cache Tests
 * Tests for LLMCache class file-based caching
 * Owner: Wayne
 * Date: 2025-12-23
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
}));

// Import after mocking
import { LLMCache, CachePurpose, CachedLLMRequest } from '../server/llm/llm-cache';

describe('LLMCache', () => {
  let cache: LLMCache;

  beforeEach(() => {
    vi.clearAllMocks();
    // Enable cache by default
    delete process.env.LLM_CACHE_ENABLED;

    // Mock existsSync to return false initially (directories don't exist)
    vi.mocked(fs.existsSync).mockReturnValue(false);

    cache = new LLMCache();
  });

  afterEach(() => {
    delete process.env.LLM_CACHE_ENABLED;
  });

  describe('constructor', () => {
    it('should create cache directories when enabled', () => {
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should not create directories when disabled', () => {
      vi.clearAllMocks();
      process.env.LLM_CACHE_ENABLED = 'false';

      new LLMCache();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should skip existing directories', () => {
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      new LLMCache();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return false when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.has('test prompt', 'analysis');

      expect(result).toBe(false);
    });

    it('should return true when cache file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = cache.has('test prompt', 'analysis');

      expect(result).toBe(true);
    });

    it('should return false when cache file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = cache.has('test prompt', 'analysis');

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should return null when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.get('test prompt', 'analysis');

      expect(result).toBeNull();
    });

    it('should return cached request when file exists', () => {
      const cachedData: CachedLLMRequest = {
        hash: 'abc123',
        purpose: 'analysis',
        prompt: 'test prompt',
        response: 'test response',
        timestamp: '2025-12-23T10:00:00Z',
        model: 'gemini-2.5-pro',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cachedData));

      const result = cache.get('test prompt', 'analysis');

      expect(result).toEqual(cachedData);
    });

    it('should return null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.json')) {
          return false;
        }
        return true;
      });

      const result = cache.get('test prompt', 'analysis');

      expect(result).toBeNull();
    });

    it('should return null on read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = cache.get('test prompt', 'analysis');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should not write when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();
      vi.clearAllMocks();

      cache.set('prompt', 'response', 'analysis');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should write cache file with correct data', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cache.set('test prompt', 'test response', 'analysis', {
        model: 'gemini-2.5-pro',
        tokensUsed: 100,
        messageId: 42,
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.stringContaining('"prompt": "test prompt"'),
        'utf-8'
      );
    });

    it('should handle write errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      // Should not throw
      expect(() => cache.set('prompt', 'response', 'analysis')).not.toThrow();
    });
  });

  describe('listByPurpose', () => {
    it('should return empty array when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.listByPurpose('analysis');

      expect(result).toEqual([]);
    });

    it('should return empty array when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = cache.listByPurpose('analysis');

      expect(result).toEqual([]);
    });

    it('should return cached entries sorted by timestamp', () => {
      const entry1: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'prompt1',
        response: 'response1',
        timestamp: '2025-12-23T08:00:00Z',
      };
      const entry2: CachedLLMRequest = {
        hash: 'hash2',
        purpose: 'analysis',
        prompt: 'prompt2',
        response: 'response2',
        timestamp: '2025-12-23T10:00:00Z',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json', 'hash2.json'] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(entry1))
        .mockReturnValueOnce(JSON.stringify(entry2));

      const result = cache.listByPurpose('analysis');

      expect(result).toHaveLength(2);
      expect(result[0].hash).toBe('hash2'); // Newer first
      expect(result[1].hash).toBe('hash1');
    });

    it('should skip non-json files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json', 'readme.txt'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'p',
        response: 'r',
        timestamp: '2025-12-23T10:00:00Z',
      }));

      const result = cache.listByPurpose('analysis');

      expect(result).toHaveLength(1);
    });
  });

  describe('listAll', () => {
    it('should return empty array when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.listAll();

      expect(result).toEqual([]);
    });

    it('should return entries grouped by purpose', () => {
      const entry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'prompt1',
        response: 'response1',
        timestamp: '2025-12-23T10:00:00Z',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (typeof dir === 'string' && dir.includes('analysis')) {
          return ['hash1.json'] as any;
        }
        return [] as any;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entry));

      const result = cache.listAll();

      expect(result.some(r => r.purpose === 'analysis')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return zero stats when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.getStats();

      expect(result.totalCached).toBe(0);
      expect(result.totalSizeBytes).toBe(0);
    });

    it('should return correct stats for cached files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        if (typeof dir === 'string' && dir.includes('analysis')) {
          return ['hash1.json', 'hash2.json'] as any;
        }
        return [] as any;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

      const result = cache.getStats();

      expect(result.byPurpose.analysis).toBe(2);
      expect(result.totalCached).toBe(2);
      expect(result.totalSizeBytes).toBe(2048);
    });
  });

  describe('clearPurpose', () => {
    it('should return 0 when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.clearPurpose('analysis');

      expect(result).toBe(0);
    });

    it('should delete all json files in purpose directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json', 'hash2.json'] as any);

      const result = cache.clearPurpose('analysis');

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(result).toBe(2);
    });

    it('should handle delete errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Delete error');
      });

      const result = cache.clearPurpose('analysis');

      expect(result).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should return 0 when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.clearAll();

      expect(result).toBe(0);
    });

    it('should clear all purposes', () => {
      // Need to create new cache with proper mocks
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      // Create fresh cache with enabled state
      const freshCache = new LLMCache();
      const result = freshCache.clearAll();

      // 6 purposes × 1 file each = 6
      expect(result).toBe(6);
    });
  });

  describe('search', () => {
    it('should return empty array when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.search('test');

      expect(result).toEqual([]);
    });

    it('should find entries matching search text in prompt', () => {
      const entry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'Find the error in this code',
        response: 'The error is...',
        timestamp: '2025-12-23T10:00:00Z',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entry));

      const result = cache.search('error', 'analysis');

      expect(result).toHaveLength(1);
      expect(result[0].prompt).toContain('error');
    });

    it('should find entries matching search text in response', () => {
      const entry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'What is this?',
        response: 'This is a troubleshooting guide',
        timestamp: '2025-12-23T10:00:00Z',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entry));

      const result = cache.search('troubleshooting', 'analysis');

      expect(result).toHaveLength(1);
    });

    it('should be case-insensitive', () => {
      const matchingEntry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'UPPERCASE text',
        response: 'response',
        timestamp: '2025-12-23T10:00:00Z',
      };
      const nonMatchingEntry: CachedLLMRequest = {
        hash: 'hash2',
        purpose: 'analysis',
        prompt: 'lowercase text',
        response: 'response',
        timestamp: '2025-12-23T10:00:00Z',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json', 'hash2.json'] as any);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(matchingEntry))
        .mockReturnValueOnce(JSON.stringify(nonMatchingEntry))
        .mockReturnValue(JSON.stringify(nonMatchingEntry)); // For other purposes

      const result = cache.search('uppercase', 'analysis'); // Filter to single purpose

      expect(result).toHaveLength(1);
    });

    it('should filter by purpose when specified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'test',
        response: 'r',
        timestamp: '2025-12-23T10:00:00Z',
      }));

      cache.search('test', 'analysis');

      // Should only search in 'analysis' directory
      expect(fs.readdirSync).toHaveBeenCalledWith(
        expect.stringContaining('analysis')
      );
    });
  });

  describe('findByMessageId', () => {
    it('should return empty array when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.findByMessageId(42);

      expect(result).toEqual([]);
    });

    it('should find entries with matching messageId', () => {
      const entry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'prompt',
        response: 'response',
        timestamp: '2025-12-23T10:00:00Z',
        messageId: 42,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entry));

      const result = cache.findByMessageId(42);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].request.messageId).toBe(42);
    });
  });

  describe('clearOlderThan', () => {
    it('should return 0 when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.clearOlderThan(7);

      expect(result).toBe(0);
    });

    it('should delete entries older than specified days', () => {
      // Create an old entry from a year ago
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const oldEntry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'old',
        response: 'r',
        timestamp: oneYearAgo.toISOString(),
      };

      // Mock directory exists for all purposes
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // Mock reading directory - return file for all purposes to simplify
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      // Mock reading file content
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(oldEntry));
      // Mock file deletion
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      // Create fresh cache with enabled state
      const freshCache = new LLMCache();
      const result = freshCache.clearOlderThan(7);

      // Should have deleted files from all 6 purposes
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(result).toBe(6); // 6 purposes × 1 file each
    });

    it('should not delete recent entries', () => {
      const recentEntry: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'recent',
        response: 'r',
        timestamp: new Date().toISOString(), // Today
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(recentEntry));

      cache.clearOlderThan(7);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('searchWithRelated', () => {
    it('should return empty array when cache is disabled', () => {
      process.env.LLM_CACHE_ENABLED = 'false';
      cache = new LLMCache();

      const result = cache.searchWithRelated('test');

      expect(result).toEqual([]);
    });

    it('should group related entries by messageId', () => {
      const entry1: CachedLLMRequest = {
        hash: 'hash1',
        purpose: 'analysis',
        prompt: 'test prompt',
        response: 'response1',
        timestamp: '2025-12-23T10:00:00Z',
        messageId: 42,
      };
      const entry2: CachedLLMRequest = {
        hash: 'hash2',
        purpose: 'review',
        prompt: 'related prompt',
        response: 'response2',
        timestamp: '2025-12-23T11:00:00Z',
        messageId: 42,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['hash1.json', 'hash2.json'] as any);
      let callCount = 0;
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        callCount++;
        // Return different entries based on call count
        return JSON.stringify(callCount % 2 === 1 ? entry1 : entry2);
      });

      const result = cache.searchWithRelated('test');

      expect(result.length).toBeGreaterThan(0);
    });
  });
});
