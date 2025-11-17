/**
 * Unit tests for ZulipBotAdapter
 * Author: Wayne
 * Date: 2025-11-17
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ZulipBotAdapter } from '../server/stream/adapters/zulip-bot-adapter';

// Mock Prisma
const mockDb = {
  importWatermark: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  streamConfig: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  unifiedMessage: {
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
} as any;

// Mock fetch globally
global.fetch = vi.fn();

describe('ZulipBotAdapter', () => {
  let adapter: ZulipBotAdapter;

  beforeEach(() => {
    adapter = new ZulipBotAdapter('test-zulip-stream', mockDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'abc123xyz',
        site: 'https://test.zulipchat.com',
        channel: 'community-support',
      };
      expect(adapter.validateConfig(config)).toBe(true);
    });

    it('should reject configuration without email', () => {
      const config = {
        apiKey: 'abc123xyz',
        site: 'https://test.zulipchat.com',
        channel: 'community-support',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should reject configuration without apiKey', () => {
      const config = {
        email: 'bot@zulipchat.com',
        site: 'https://test.zulipchat.com',
        channel: 'community-support',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should reject configuration without site', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'abc123xyz',
        channel: 'community-support',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should reject configuration without channel', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'abc123xyz',
        site: 'https://test.zulipchat.com',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should reject configuration with invalid site URL', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'abc123xyz',
        site: 'not-a-url',
        channel: 'community-support',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should set default values for optional config', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'abc123xyz',
        site: 'https://test.zulipchat.com',
        channel: 'community-support',
      };
      adapter.validateConfig(config);

      // Check that defaults are applied
      const botConfig = (adapter as any).botConfig;
      expect(botConfig.pollingInterval).toBe(30000);
      expect(botConfig.batchSize).toBe(100);
      expect(botConfig.ignoreOldMessages).toBe(true);
    });

    it('should respect custom optional values', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'abc123xyz',
        site: 'https://test.zulipchat.com',
        channel: 'community-support',
        pollingInterval: 60000,
        batchSize: 50,
        ignoreOldMessages: false,
      };
      adapter.validateConfig(config);

      const botConfig = (adapter as any).botConfig;
      expect(botConfig.pollingInterval).toBe(60000);
      expect(botConfig.batchSize).toBe(50);
      expect(botConfig.ignoreOldMessages).toBe(false);
    });
  });

  describe('Message Normalization', () => {
    it('should normalize stream message correctly', () => {
      const mockZulipMessage = {
        id: 12345678,
        sender_id: 98765,
        sender_full_name: 'John Doe',
        sender_email: 'john@example.com',
        timestamp: 1699012345,
        content: 'How do I configure the RPC timeout?',
        display_recipient: 'community-support',
        subject: 'RPC Configuration',
        type: 'stream' as const,
      };

      // Access private method via bracket notation
      const normalized = (adapter as any).normalizeMessage(mockZulipMessage);

      expect(normalized.messageId).toBe('12345678');
      expect(normalized.timestamp).toEqual(new Date(1699012345 * 1000));
      expect(normalized.author).toBe('John Doe');
      expect(normalized.content).toBe('How do I configure the RPC timeout?');
      expect(normalized.channel).toBe('community-support');
      expect(normalized.metadata.topic).toBe('RPC Configuration');
      expect(normalized.metadata.senderEmail).toBe('john@example.com');
      expect(normalized.metadata.senderId).toBe('98765');
      expect(normalized.metadata.messageType).toBe('stream');
    });

    it('should normalize direct message correctly', () => {
      const mockZulipMessage = {
        id: 87654321,
        sender_id: 11111,
        sender_full_name: 'Alice Smith',
        sender_email: 'alice@example.com',
        timestamp: 1699012350,
        content: 'Hello, can you help me?',
        display_recipient: [
          { id: 11111, email: 'alice@example.com', full_name: 'Alice Smith' },
          { id: 22222, email: 'bob@example.com', full_name: 'Bob Jones' },
        ],
        subject: '',
        type: 'private' as const,
      };

      const normalized = (adapter as any).normalizeMessage(mockZulipMessage);

      expect(normalized.messageId).toBe('87654321');
      expect(normalized.author).toBe('Alice Smith');
      expect(normalized.content).toBe('Hello, can you help me?');
      expect(normalized.channel).toBe('Direct Message');
      expect(normalized.metadata.messageType).toBe('private');
    });

    it('should include raw Zulip message data', () => {
      const mockZulipMessage = {
        id: 11111111,
        sender_id: 33333,
        sender_full_name: 'Test User',
        sender_email: 'test@example.com',
        timestamp: 1699012360,
        content: 'Test message',
        display_recipient: 'general',
        subject: 'Testing',
        type: 'stream' as const,
      };

      const normalized = (adapter as any).normalizeMessage(mockZulipMessage);

      expect(normalized.rawData).toEqual(mockZulipMessage);
    });
  });

  describe('Auth Header Generation', () => {
    it('should generate correct Basic Auth header', () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'test-api-key-123',
        site: 'https://test.zulipchat.com',
        channel: 'general',
      };
      adapter.validateConfig(config);

      const authHeader = (adapter as any).getAuthHeader();

      // Basic auth should be: "Basic base64(email:apiKey)"
      const expectedCredentials = 'bot@zulipchat.com:test-api-key-123';
      const expectedHeader = `Basic ${Buffer.from(expectedCredentials).toString('base64')}`;

      expect(authHeader).toBe(expectedHeader);
    });
  });

  describe('Adapter Properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('zulip');
    });

    it('should have correct stream ID', () => {
      expect(adapter.streamId).toBe('test-zulip-stream');
    });
  });

  describe('Initialization', () => {
    it('should not be initialized before initialize() is called', () => {
      const isInitialized = (adapter as any).initialized;
      expect(isInitialized).toBe(false);
    });
  });

  describe('Connection Test', () => {
    it('should return true for successful connection', async () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'test-api-key',
        site: 'https://test.zulipchat.com',
        channel: 'general',
      };
      adapter.validateConfig(config);

      // Mock successful API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: 'bot@zulipchat.com', result: 'success' }),
      });

      const testConnection = (adapter as any).testConnection.bind(adapter);
      const result = await testConnection();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.zulipchat.com/api/v1/users/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should return false for failed connection', async () => {
      const config = {
        email: 'bot@zulipchat.com',
        apiKey: 'wrong-key',
        site: 'https://test.zulipchat.com',
        channel: 'general',
      };
      adapter.validateConfig(config);

      // Mock failed API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const testConnection = (adapter as any).testConnection.bind(adapter);
      const result = await testConnection();

      expect(result).toBe(false);
    });
  });
});
