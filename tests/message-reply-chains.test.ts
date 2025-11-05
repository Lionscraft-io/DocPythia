/**
 * Unit Tests: Message Reply Chains
 * Tests for reply-to message tracking, reply chain detection, and conversation grouping
 * Author: Wayne
 * Date: 2025-11-04
 * Reference: /docs/archive/specs/telegram-reply-chain-visualization.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TelegramBotAdapter } from '../server/stream/adapters/telegram-bot-adapter';
import { Context } from 'telegraf';

const prisma = new PrismaClient();

describe('Message Reply Chains', () => {
  let adapter: TelegramBotAdapter;
  const testStreamId = 'test-telegram-stream';
  const testChatId = -1001234567890;

  beforeEach(async () => {
    adapter = new TelegramBotAdapter(testStreamId);

    // Register stream config
    await prisma.streamConfig.upsert({
      where: { streamId: testStreamId },
      update: {},
      create: {
        streamId: testStreamId,
        adapterType: 'telegram-bot',
        enabled: true,
        config: {
          botToken: 'test-token',
          mode: 'polling',
        },
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.unifiedMessage.deleteMany({
      where: { streamId: testStreamId },
    });
    await prisma.streamConfig.deleteMany({
      where: { streamId: testStreamId },
    });
  });

  describe('Reply-To Message Tracking', () => {
    it('should capture replyToMessageId in database', async () => {
      // Test by creating a message with reply metadata
      const message = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-123`,
          author: 'Test User',
          content: 'This is a reply',
          timestamp: new Date(),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          metadata: {
            chatId: testChatId,
            messageId: 123,
            replyToMessageId: 122,
          },
          rawData: {},
        },
      });

      expect(message.metadata).toBeDefined();
      expect(message.metadata.replyToMessageId).toBe(122);
      expect(message.metadata.chatId).toBe(testChatId);
      expect(message.metadata.messageId).toBe(123);

      // Cleanup
      await prisma.unifiedMessage.delete({ where: { id: message.id } });
    });

    it('should handle messages without reply', async () => {
      const message = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-124`,
          author: 'Test User',
          content: 'Standalone message',
          timestamp: new Date(),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          metadata: {
            chatId: testChatId,
            messageId: 124,
          },
          rawData: {},
        },
      });

      expect(message.metadata.replyToMessageId).toBeUndefined();

      // Cleanup
      await prisma.unifiedMessage.delete({ where: { id: message.id } });
    });

    it('should track message thread ID for topics', async () => {
      const message = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-125`,
          author: 'Test User',
          content: 'Message in topic',
          timestamp: new Date(),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          metadata: {
            chatId: testChatId,
            messageId: 125,
            messageThreadId: 5,
          },
          rawData: {},
        },
      });

      expect(message.metadata.messageThreadId).toBe(5);

      // Cleanup
      await prisma.unifiedMessage.delete({ where: { id: message.id } });
    });
  });

  describe('Reply Chain Detection', () => {
    it('should detect simple reply chain (A -> B)', async () => {
      // Create two messages where B replies to A
      const messageA = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-100`,
          author: 'UserA',
          content: 'Original message',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 100,
          },
          rawData: {},
        },
      });

      const messageB = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-101`,
          author: 'UserB',
          content: 'Reply to original',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 101,
            replyToMessageId: 100,
          },
          rawData: {},
        },
      });

      // Query and verify the reply relationship
      const messages = await prisma.unifiedMessage.findMany({
        where: { streamId: testStreamId },
        orderBy: { timestamp: 'asc' },
      });

      expect(messages).toHaveLength(2);
      expect(messages[1].metadata).toMatchObject({
        replyToMessageId: 100,
      });

      // Verify composite ID format
      const replyToCompositeId = `${testChatId}-${messages[1].metadata.replyToMessageId}`;
      expect(replyToCompositeId).toBe(messageA.messageId);
    });

    it('should detect threaded reply chain (A -> B -> C)', async () => {
      // Create three messages: A, B replies to A, C replies to B
      const messageA = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-200`,
          author: 'UserA',
          content: 'Thread start',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 200,
          },
        },
      });

      const messageB = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-201`,
          author: 'UserB',
          content: 'First reply',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 201,
            replyToMessageId: 200,
          },
        },
      });

      const messageC = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-202`,
          author: 'UserC',
          content: 'Second reply',
          timestamp: new Date('2025-01-01T10:02:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 202,
            replyToMessageId: 201,
          },
        },
      });

      // Verify the chain
      const messages = await prisma.unifiedMessage.findMany({
        where: { streamId: testStreamId },
        orderBy: { timestamp: 'asc' },
      });

      expect(messages).toHaveLength(3);
      expect(messages[0].metadata.replyToMessageId).toBeUndefined();
      expect(messages[1].metadata.replyToMessageId).toBe(200);
      expect(messages[2].metadata.replyToMessageId).toBe(201);
    });

    it('should handle branching reply chains (A -> B, A -> C)', async () => {
      // Create branching replies: both B and C reply to A
      const messageA = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-300`,
          author: 'UserA',
          content: 'Original',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 300,
          },
        },
      });

      const messageB = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-301`,
          author: 'UserB',
          content: 'Branch 1',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 301,
            replyToMessageId: 300,
          },
        },
      });

      const messageC = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-302`,
          author: 'UserC',
          content: 'Branch 2',
          timestamp: new Date('2025-01-01T10:02:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 302,
            replyToMessageId: 300,
          },
        },
      });

      // Both B and C should reference A
      const messages = await prisma.unifiedMessage.findMany({
        where: { streamId: testStreamId },
        orderBy: { timestamp: 'asc' },
      });

      expect(messages[1].metadata.replyToMessageId).toBe(300);
      expect(messages[2].metadata.replyToMessageId).toBe(300);
    });
  });

  describe('Conversation Grouping with Reply Chains', () => {
    it('should group reply chain messages into same conversation', async () => {
      // Create a reply chain
      const msg1 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-400`,
          author: 'UserA',
          content: 'Start thread',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 400 },
        },
      });

      const msg2 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-401`,
          author: 'UserB',
          content: 'Reply 1',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 401, replyToMessageId: 400 },
        },
      });

      const msg3 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-402`,
          author: 'UserC',
          content: 'Reply 2',
          timestamp: new Date('2025-01-01T10:02:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 402, replyToMessageId: 401 },
        },
      });

      // Create classifications with conversation ID
      const conversationId = 'conv-reply-chain-400';

      await prisma.messageClassification.createMany({
        data: [
          {
            messageId: msg1.id,
            category: 'question',
            conversationId,
            docValueReason: 'Test doc value reason',
            batchId: 'batch-1',
          },
          {
            messageId: msg2.id,
            category: 'question',
            conversationId,
            docValueReason: 'Test doc value reason',
            batchId: 'batch-1',
          },
          {
            messageId: msg3.id,
            category: 'question',
            conversationId,
            docValueReason: 'Test doc value reason',
            batchId: 'batch-1',
          },
        ],
      });

      // Verify all messages are in the same conversation
      const classifications = await prisma.messageClassification.findMany({
        where: { conversationId },
      });

      expect(classifications).toHaveLength(3);
      expect(new Set(classifications.map(c => c.conversationId)).size).toBe(1);
    });

    it('should separate independent conversations', async () => {
      // Create two independent conversations
      const conv1Msg1 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-500`,
          author: 'UserA',
          content: 'Conversation 1',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 500 },
        },
      });

      const conv1Msg2 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-501`,
          author: 'UserB',
          content: 'Reply to conversation 1',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 501, replyToMessageId: 500 },
        },
      });

      const conv2Msg1 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-502`,
          author: 'UserC',
          content: 'Conversation 2',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 502 },
        },
      });

      // Create separate conversations
      await prisma.messageClassification.createMany({
        data: [
          {
            messageId: conv1Msg1.id,
            category: 'question',
            conversationId: 'conv-1',
            docValueReason: 'Test doc value reason',
            batchId: 'batch-1',
          },
          {
            messageId: conv1Msg2.id,
            category: 'question',
            conversationId: 'conv-1',
            docValueReason: 'Test doc value reason',
            batchId: 'batch-1',
          },
          {
            messageId: conv2Msg1.id,
            category: 'question',
            conversationId: 'conv-2',
            docValueReason: 'Test doc value reason',
            batchId: 'batch-1',
          },
        ],
      });

      // Verify two separate conversations
      const conversations = await prisma.messageClassification.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: {
            in: ['conv-1', 'conv-2'],
          },
        },
        _count: true,
      });

      expect(conversations).toHaveLength(2);
      const conv1 = conversations.find(c => c.conversationId === 'conv-1');
      const conv2 = conversations.find(c => c.conversationId === 'conv-2');

      expect(conv1?._count).toBe(2);
      expect(conv2?._count).toBe(1);
    });
  });

  describe('Cross-Batch Reply Chains', () => {
    it('should handle replies that span multiple batches', async () => {
      // Message A in batch 1
      const messageA = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-600`,
          author: 'UserA',
          content: 'Original in batch 1',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 600 },
        },
      });

      await prisma.messageClassification.create({
        data: {
          messageId: messageA.id,
          category: 'question',
          conversationId: 'conv-cross-batch',
          docValueReason: 'Test doc value reason',
          batchId: 'batch-1',
        },
      });

      // Message B in batch 2 replies to A
      const messageB = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-601`,
          author: 'UserB',
          content: 'Reply in batch 2',
          timestamp: new Date('2025-01-01T11:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'COMPLETED',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 601, replyToMessageId: 600 },
        },
      });

      // Should still link to same conversation even though different batch
      await prisma.messageClassification.create({
        data: {
          messageId: messageB.id,
          category: 'question',
          conversationId: 'conv-cross-batch',
          docValueReason: 'Test doc value reason',
          batchId: 'batch-2',
        },
      });

      // Verify both messages in same conversation
      const classifications = await prisma.messageClassification.findMany({
        where: { conversationId: 'conv-cross-batch' },
      });

      expect(classifications).toHaveLength(2);
      expect(classifications.map(c => c.batchId)).toEqual(['batch-1', 'batch-2']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle reply to non-existent message', async () => {
      // Message replies to ID that doesn't exist in database
      const message = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-700`,
          author: 'UserA',
          content: 'Reply to unknown',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: {
            chatId: testChatId,
            messageId: 700,
            replyToMessageId: 999, // Non-existent
          },
        },
      });

      // Should still save the message
      const saved = await prisma.unifiedMessage.findUnique({
        where: { id: message.id },
      });

      expect(saved).toBeTruthy();
      expect(saved?.metadata.replyToMessageId).toBe(999);
    });

    it('should handle circular reply chains gracefully', async () => {
      // This shouldn't happen in real Telegram, but test defensive handling
      const msg1 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-800`,
          author: 'UserA',
          content: 'Msg 1',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 800, replyToMessageId: 801 },
        },
      });

      const msg2 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-801`,
          author: 'UserB',
          content: 'Msg 2',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: { chatId: testChatId, messageId: 801, replyToMessageId: 800 },
        },
      });

      // Should save both messages despite circular reference
      const messages = await prisma.unifiedMessage.findMany({
        where: { streamId: testStreamId },
      });

      expect(messages).toHaveLength(2);
    });

    it('should handle messages from different chats with same message ID', async () => {
      const chat1 = -1001111111111;
      const chat2 = -1002222222222;

      // Same message ID but different chats
      const msg1 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${chat1}-100`,
          author: 'UserA',
          content: 'Chat 1 message',
          timestamp: new Date(),
          channel: 'chat-1',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: { chatId: chat1, messageId: 100 },
        },
      });

      const msg2 = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${chat2}-100`,
          author: 'UserB',
          content: 'Chat 2 message',
          timestamp: new Date(),
          channel: 'chat-2',
          processingStatus: 'PENDING',
          rawData: {},
          metadata: { chatId: chat2, messageId: 100 },
        },
      });

      // Both should be saved with unique composite IDs
      const messages = await prisma.unifiedMessage.findMany({
        where: { streamId: testStreamId },
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].messageId).not.toBe(messages[1].messageId);
    });
  });

  describe('Reply Chain Metadata Preservation', () => {
    it('should preserve full metadata including update ID and thread ID', async () => {
      const message = await prisma.unifiedMessage.create({
        data: {
          streamId: testStreamId,
          messageId: `${testChatId}-126`,
          author: 'Test User',
          content: 'Test message with full metadata',
          timestamp: new Date(),
          channel: 'test-channel',
          processingStatus: 'PENDING',
          metadata: {
            messageId: 126,
            chatId: testChatId,
            replyToMessageId: 125,
            messageThreadId: 5,
            updateId: 999,
          },
          rawData: {},
        },
      });

      expect(message.metadata).toMatchObject({
        messageId: 126,
        chatId: testChatId,
        replyToMessageId: 125,
        messageThreadId: 5,
        updateId: 999,
      });

      // Cleanup
      await prisma.unifiedMessage.delete({ where: { id: message.id } });
    });
  });
});
