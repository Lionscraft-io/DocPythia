/**
 * Script Logic Tests
 * Owner: Wayne
 * Date: 2025-12-29
 *
 * Tests for the extracted logic from CLI scripts.
 * These tests cover the core business logic without process.exit() concerns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock storage
const mockStorage = vi.hoisted(() => ({
  getUnanalyzedMessages: vi.fn(),
}));

vi.mock('../server/storage', () => ({
  storage: mockStorage,
}));

// Mock analyzer factory
const mockAnalyzer = vi.hoisted(() => ({
  analyzeUnanalyzedMessages: vi.fn(),
}));

const mockCreateAnalyzerFromEnv = vi.hoisted(() => vi.fn());

vi.mock('../server/analyzer/gemini-analyzer', () => ({
  createAnalyzerFromEnv: mockCreateAnalyzerFromEnv,
}));

// Mock scraper factory
const mockScraper = vi.hoisted(() => ({
  testConnection: vi.fn(),
  performFullScrape: vi.fn(),
}));

const mockCreateZulipchatScraperFromEnv = vi.hoisted(() => vi.fn());

vi.mock('../server/scraper/zulipchat', () => ({
  createZulipchatScraperFromEnv: mockCreateZulipchatScraperFromEnv,
}));

// Import the module under test after mocking
import {
  runAnalyzeMessages,
  runFullScrape,
  parseAnalyzeMessagesArgs,
  parseFullScrapeArgs,
  formatHeader,
  type AnalyzeMessagesOptions,
  type AnalyzeMessagesResult,
  type FullScrapeOptions,
  type FullScrapeResult,
} from '../server/scripts/script-logic';

describe('Script Logic Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('runAnalyzeMessages', () => {
    it('should return error when analyzer is not configured', async () => {
      mockCreateAnalyzerFromEnv.mockReturnValue(null);

      const result = await runAnalyzeMessages({ limit: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gemini API key not configured');
      expect(result.analyzed).toBe(0);
      expect(result.relevant).toBe(0);
      expect(result.updatesCreated).toBe(0);
      expect(result.remaining).toBe(0);
    });

    it('should successfully analyze messages', async () => {
      mockCreateAnalyzerFromEnv.mockReturnValue(mockAnalyzer);
      mockStorage.getUnanalyzedMessages
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]) // before
        .mockResolvedValueOnce([{ id: 3 }]); // after
      mockAnalyzer.analyzeUnanalyzedMessages.mockResolvedValue({
        analyzed: 2,
        relevant: 1,
        updatesCreated: 1,
      });

      const result = await runAnalyzeMessages({ limit: 100 });

      expect(result.success).toBe(true);
      expect(result.analyzed).toBe(2);
      expect(result.relevant).toBe(1);
      expect(result.updatesCreated).toBe(1);
      expect(result.remaining).toBe(1);
      expect(mockAnalyzer.analyzeUnanalyzedMessages).toHaveBeenCalledWith(100);
    });

    it('should respect the limit parameter', async () => {
      mockCreateAnalyzerFromEnv.mockReturnValue(mockAnalyzer);
      mockStorage.getUnanalyzedMessages.mockResolvedValue([]);
      mockAnalyzer.analyzeUnanalyzedMessages.mockResolvedValue({
        analyzed: 50,
        relevant: 10,
        updatesCreated: 5,
      });

      await runAnalyzeMessages({ limit: 50 });

      expect(mockAnalyzer.analyzeUnanalyzedMessages).toHaveBeenCalledWith(50);
    });

    it('should handle analysis errors gracefully', async () => {
      mockCreateAnalyzerFromEnv.mockReturnValue(mockAnalyzer);
      mockStorage.getUnanalyzedMessages.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockAnalyzer.analyzeUnanalyzedMessages.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const result = await runAnalyzeMessages({ limit: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limit exceeded');
      expect(result.remaining).toBe(2);
    });

    it('should handle empty message list', async () => {
      mockCreateAnalyzerFromEnv.mockReturnValue(mockAnalyzer);
      mockStorage.getUnanalyzedMessages.mockResolvedValue([]);
      mockAnalyzer.analyzeUnanalyzedMessages.mockResolvedValue({
        analyzed: 0,
        relevant: 0,
        updatesCreated: 0,
      });

      const result = await runAnalyzeMessages({ limit: 100 });

      expect(result.success).toBe(true);
      expect(result.analyzed).toBe(0);
    });
  });

  describe('runFullScrape', () => {
    it('should return error when scraper is not configured', async () => {
      mockCreateZulipchatScraperFromEnv.mockReturnValue(null);

      const result = await runFullScrape({ channelName: 'test', batchSize: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Zulipchat credentials not configured');
      expect(result.totalMessages).toBe(0);
    });

    it('should return error when connection fails', async () => {
      mockCreateZulipchatScraperFromEnv.mockReturnValue(mockScraper);
      mockScraper.testConnection.mockResolvedValue(false);

      const result = await runFullScrape({ channelName: 'test', batchSize: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not connect to Zulipchat');
      expect(result.totalMessages).toBe(0);
    });

    it('should successfully scrape messages', async () => {
      mockCreateZulipchatScraperFromEnv.mockReturnValue(mockScraper);
      mockScraper.testConnection.mockResolvedValue(true);
      mockScraper.performFullScrape.mockResolvedValue(1500);

      const result = await runFullScrape({
        channelName: 'community-support',
        batchSize: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.totalMessages).toBe(1500);
      expect(mockScraper.performFullScrape).toHaveBeenCalledWith('community-support', 1000);
    });

    it('should handle scrape errors gracefully', async () => {
      mockCreateZulipchatScraperFromEnv.mockReturnValue(mockScraper);
      mockScraper.testConnection.mockResolvedValue(true);
      mockScraper.performFullScrape.mockRejectedValue(new Error('Network timeout'));

      const result = await runFullScrape({ channelName: 'test', batchSize: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.totalMessages).toBe(0);
    });

    it('should use correct channel and batch size', async () => {
      mockCreateZulipchatScraperFromEnv.mockReturnValue(mockScraper);
      mockScraper.testConnection.mockResolvedValue(true);
      mockScraper.performFullScrape.mockResolvedValue(500);

      await runFullScrape({ channelName: 'validators', batchSize: 500 });

      expect(mockScraper.performFullScrape).toHaveBeenCalledWith('validators', 500);
    });
  });

  describe('parseAnalyzeMessagesArgs', () => {
    it('should parse limit from argv', () => {
      const result = parseAnalyzeMessagesArgs(['node', 'script.ts', '50']);
      expect(result.limit).toBe(50);
    });

    it('should use default limit when not provided', () => {
      const result = parseAnalyzeMessagesArgs(['node', 'script.ts']);
      expect(result.limit).toBe(100);
    });

    it('should handle various numeric formats', () => {
      expect(parseAnalyzeMessagesArgs(['n', 's', '1']).limit).toBe(1);
      expect(parseAnalyzeMessagesArgs(['n', 's', '999']).limit).toBe(999);
      expect(parseAnalyzeMessagesArgs(['n', 's', '10000']).limit).toBe(10000);
    });
  });

  describe('parseFullScrapeArgs', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should parse channel and batch size from argv', () => {
      const result = parseFullScrapeArgs(['node', 'script.ts', 'my-channel', '500'], {});
      expect(result.channelName).toBe('my-channel');
      expect(result.batchSize).toBe(500);
    });

    it('should use env var for channel when not in argv', () => {
      const result = parseFullScrapeArgs(['node', 'script.ts'], {
        ZULIP_CHANNEL: 'env-channel',
      });
      expect(result.channelName).toBe('env-channel');
    });

    it('should use default channel when not provided', () => {
      const result = parseFullScrapeArgs(['node', 'script.ts'], {});
      expect(result.channelName).toBe('community-support');
    });

    it('should use default batch size when not provided', () => {
      const result = parseFullScrapeArgs(['node', 'script.ts', 'channel'], {});
      expect(result.batchSize).toBe(1000);
    });

    it('should prioritize argv over env vars', () => {
      const result = parseFullScrapeArgs(['node', 'script.ts', 'argv-channel'], {
        ZULIP_CHANNEL: 'env-channel',
      });
      expect(result.channelName).toBe('argv-channel');
    });
  });

  describe('formatHeader', () => {
    it('should format header with box characters', () => {
      const result = formatHeader('Test Title');
      expect(result).toContain('╔');
      expect(result).toContain('╗');
      expect(result).toContain('║');
      expect(result).toContain('╚');
      expect(result).toContain('╝');
      expect(result).toContain('Test Title');
    });

    it('should create fixed-width header', () => {
      const result = formatHeader('Short');
      const lines = result.split('\n');
      expect(lines[0].length).toBe(50);
      expect(lines[1].length).toBe(50);
      expect(lines[2].length).toBe(50);
    });

    it('should handle longer titles', () => {
      const result = formatHeader('A Very Long Title That Is Quite Long');
      expect(result).toContain('A Very Long Title That Is Quite Long');
    });

    it('should handle empty title', () => {
      const result = formatHeader('');
      expect(result).toContain('╔');
      expect(result).toContain('╝');
    });
  });

  describe('Type exports', () => {
    it('should export AnalyzeMessagesOptions type correctly', () => {
      const options: AnalyzeMessagesOptions = { limit: 100 };
      expect(options.limit).toBe(100);
    });

    it('should export AnalyzeMessagesResult type correctly', () => {
      const result: AnalyzeMessagesResult = {
        success: true,
        analyzed: 10,
        relevant: 5,
        updatesCreated: 3,
        remaining: 0,
      };
      expect(result.success).toBe(true);
    });

    it('should export FullScrapeOptions type correctly', () => {
      const options: FullScrapeOptions = {
        channelName: 'test',
        batchSize: 1000,
      };
      expect(options.channelName).toBe('test');
    });

    it('should export FullScrapeResult type correctly', () => {
      const result: FullScrapeResult = {
        success: true,
        totalMessages: 1500,
      };
      expect(result.success).toBe(true);
    });

    it('should include optional error in result types', () => {
      const analyzeResult: AnalyzeMessagesResult = {
        success: false,
        analyzed: 0,
        relevant: 0,
        updatesCreated: 0,
        remaining: 0,
        error: 'Test error',
      };
      expect(analyzeResult.error).toBe('Test error');

      const scrapeResult: FullScrapeResult = {
        success: false,
        totalMessages: 0,
        error: 'Another error',
      };
      expect(scrapeResult.error).toBe('Another error');
    });
  });
});
