/**
 * Unit tests for TelegramBotAdapter
 * Author: Wayne
 * Date: 2025-11-04
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TelegramBotAdapter } from '../server/stream/adapters/telegram-bot-adapter';

// Mock Prisma
vi.mock('../server/db', () => ({
  default: {
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
  },
}));

// Mock Telegraf
vi.mock('telegraf', () => {
  return {
    Telegraf: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      command: vi.fn(),
      launch: vi.fn().mockResolvedValue(undefined),
      telegram: {
        setWebhook: vi.fn().mockResolvedValue(undefined),
        deleteWebhook: vi.fn().mockResolvedValue(undefined),
      },
      stop: vi.fn(),
      handleUpdate: vi.fn(),
    })),
  };
});

describe('TelegramBotAdapter', () => {
  let adapter: TelegramBotAdapter;

  beforeEach(() => {
    adapter = new TelegramBotAdapter('test-telegram-bot');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should validate correct polling configuration', () => {
      const config = {
        botToken: '123456:ABC-DEF',
        mode: 'polling',
      };
      expect(adapter.validateConfig(config)).toBe(true);
    });

    it('should validate correct webhook configuration', () => {
      const config = {
        botToken: '123456:ABC-DEF',
        mode: 'webhook',
        webhookUrl: 'https://example.com',
      };
      expect(adapter.validateConfig(config)).toBe(true);
    });

    it('should reject configuration without bot token', () => {
      const config = { mode: 'polling' };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should reject configuration with invalid mode', () => {
      const config = {
        botToken: '123456:ABC-DEF',
        mode: 'invalid',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should reject webhook mode without webhookUrl', () => {
      const config = {
        botToken: '123456:ABC-DEF',
        mode: 'webhook',
      };
      expect(adapter.validateConfig(config)).toBe(false);
    });

    it('should set default values for optional config', () => {
      const config = {
        botToken: '123456:ABC-DEF',
        mode: 'polling',
      };
      adapter.validateConfig(config);

      // Check that defaults are applied
      const botConfig = (adapter as any).botConfig;
      expect(botConfig.webhookPath).toBe('/telegram-webhook');
      expect(botConfig.pollingInterval).toBe(3000);
      expect(botConfig.ignoreOldMessages).toBe(true);
      expect(botConfig.processCommands).toBe(false);
      expect(botConfig.saveRawUpdates).toBe(true);
    });
  });

  describe('Message Normalization', () => {
    it('should normalize group message correctly', () => {
      // Initialize config first
      adapter.validateConfig({
        botToken: '123456:ABC-DEF',
        mode: 'polling',
      });

      const mockMessage = {
        message_id: 123,
        date: 1699012345,
        chat: {
          id: -1001234567890,
          title: 'Test Group',
          type: 'supergroup' as const,
        },
        from: {
          id: 987654321,
          first_name: 'John',
          last_name: 'Doe',
          username: 'johndoe',
        },
        text: 'How do I configure RPC timeout?',
      };

      const mockUpdate = {
        update_id: 456,
        message: mockMessage,
      };

      // Access private method via bracket notation
      const normalized = (adapter as any).normalizeMessage(mockMessage, mockUpdate);

      expect(normalized.messageId).toBe('-1001234567890-123');
      expect(normalized.author).toContain('John Doe');
      expect(normalized.author).toContain('@johndoe');
      expect(normalized.content).toBe('How do I configure RPC timeout?');
      expect(normalized.channel).toBe('Test Group');
      expect(normalized.metadata.chatId).toBe('-1001234567890');
      expect(normalized.metadata.chatType).toBe('supergroup');
      expect(normalized.metadata.updateId).toBe(456);
    });

    it('should normalize direct message correctly', () => {
      // Initialize config first
      adapter.validateConfig({
        botToken: '123456:ABC-DEF',
        mode: 'polling',
      });

      const mockMessage = {
        message_id: 789,
        date: 1699012350,
        chat: {
          id: 12345678,
          first_name: 'Alice',
          type: 'private' as const,
        },
        from: {
          id: 12345678,
          first_name: 'Alice',
        },
        text: 'Hello bot!',
      };

      const mockUpdate = {
        update_id: 457,
        message: mockMessage,
      };

      const normalized = (adapter as any).normalizeMessage(mockMessage, mockUpdate);

      expect(normalized.messageId).toBe('12345678-789');
      expect(normalized.author).toBe('Alice');
      expect(normalized.content).toBe('Hello bot!');
      expect(normalized.channel).toBe('Direct Message');
      expect(normalized.metadata.chatType).toBe('private');
    });

    it('should handle message without username', () => {
      // Initialize config first
      adapter.validateConfig({
        botToken: '123456:ABC-DEF',
        mode: 'polling',
      });

      const mockMessage = {
        message_id: 111,
        date: 1699012360,
        chat: {
          id: -1001234567890,
          title: 'Test Channel',
          type: 'channel' as const,
        },
        from: {
          id: 987654321,
          first_name: 'Bob',
        },
        text: 'Test message',
      };

      const mockUpdate = {
        update_id: 458,
        message: mockMessage,
      };

      const normalized = (adapter as any).normalizeMessage(mockMessage, mockUpdate);

      expect(normalized.author).toBe('Bob');
      expect(normalized.author).not.toContain('@');
    });

    it('should include reply metadata when message is a reply', () => {
      // Initialize config first
      adapter.validateConfig({
        botToken: '123456:ABC-DEF',
        mode: 'polling',
      });

      const mockMessage = {
        message_id: 222,
        date: 1699012370,
        chat: {
          id: -1001234567890,
          title: 'Test Group',
          type: 'supergroup' as const,
        },
        from: {
          id: 987654321,
          first_name: 'Charlie',
        },
        text: 'This is a reply',
        reply_to_message: {
          message_id: 221,
        },
      };

      const mockUpdate = {
        update_id: 459,
        message: mockMessage,
      };

      const normalized = (adapter as any).normalizeMessage(mockMessage, mockUpdate);

      expect(normalized.metadata.replyToMessageId).toBe(221);
    });
  });

  describe('fetchMessages', () => {
    it('should return empty array for push-based bot', async () => {
      const messages = await adapter.fetchMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('Adapter Properties', () => {
    it('should have correct adapter type', () => {
      expect(adapter.adapterType).toBe('telegram-bot');
    });

    it('should have correct stream ID', () => {
      expect(adapter.streamId).toBe('test-telegram-bot');
    });
  });
});
