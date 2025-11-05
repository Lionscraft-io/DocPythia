/**
 * Unit Tests for Conversation Grouping Algorithm
 * Tests the logic that groups messages into logical conversations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BatchMessageProcessor } from '../server/stream/processors/batch-message-processor';

describe('Conversation Grouping', () => {
  let processor: BatchMessageProcessor;

  beforeEach(() => {
    processor = new BatchMessageProcessor({
      conversationTimeWindowMinutes: 15,
      maxConversationSize: 20,
      minConversationGapMinutes: 5,
    });
  });

  describe('Basic Grouping', () => {
    it('should group messages from same channel within time window', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'troubleshooting', docValueReason: 'Error discussion' },
        { messageId: 2, category: 'troubleshooting', docValueReason: 'Follow-up' },
        { messageId: 3, category: 'troubleshooting', docValueReason: 'Solution' },
      ];

      const allMessages = [
        {
          id: 1,
          timestamp: baseTime,
          author: 'user1',
          content: 'Getting timeout errors',
          channel: 'help'
        },
        {
          id: 2,
          timestamp: new Date(baseTime.getTime() + 5 * 60 * 1000), // +5 min
          author: 'user2',
          content: 'What timeout setting?',
          channel: 'help'
        },
        {
          id: 3,
          timestamp: new Date(baseTime.getTime() + 10 * 60 * 1000), // +10 min
          author: 'user1',
          content: 'Using default 30s',
          channel: 'help'
        },
      ];

      // Access private method for testing
      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations).toHaveLength(1);
      expect(conversations[0].messageCount).toBe(3);
      expect(conversations[0].channel).toBe('help');
    });

    it('should split conversations by channel', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
        { messageId: 2, category: 'info', docValueReason: 'Info' },
        { messageId: 3, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'general' },
        { id: 2, timestamp: new Date(baseTime.getTime() + 2 * 60 * 1000), author: 'user2', content: 'Msg 2', channel: 'help' },
        { id: 3, timestamp: new Date(baseTime.getTime() + 4 * 60 * 1000), author: 'user3', content: 'Msg 3', channel: 'general' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      // Messages are sorted by channel first, then timestamp
      // So we get: general[10:00], general[10:04] in one conversation (4min gap < 5min threshold)
      // And help[10:02] in another conversation
      expect(conversations).toHaveLength(2);
      expect(conversations.some(c => c.channel === 'general')).toBe(true);
      expect(conversations.some(c => c.channel === 'help')).toBe(true);
    });

    it('should split conversations on significant time gap', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
        { messageId: 2, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'help' },
        // 20-minute gap (> 5-minute minimum gap)
        { id: 2, timestamp: new Date(baseTime.getTime() + 20 * 60 * 1000), author: 'user2', content: 'Msg 2', channel: 'help' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations).toHaveLength(2);
      expect(conversations[0].messageCount).toBe(1);
      expect(conversations[1].messageCount).toBe(1);
    });

    it('should NOT split conversations on small time gap', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
        { messageId: 2, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'help' },
        // 3-minute gap (< 5-minute minimum gap)
        { id: 2, timestamp: new Date(baseTime.getTime() + 3 * 60 * 1000), author: 'user2', content: 'Msg 2', channel: 'help' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations).toHaveLength(1);
      expect(conversations[0].messageCount).toBe(2);
    });

    it('should enforce maximum conversation size', async () => {
      const processor = new BatchMessageProcessor({
        conversationTimeWindowMinutes: 60,
        maxConversationSize: 5, // Small limit for testing
        minConversationGapMinutes: 5,
      });

      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [];
      const allMessages = [];

      // Create 10 messages in same channel, all within time window
      for (let i = 0; i < 10; i++) {
        valuableMessages.push({ messageId: i + 1, category: 'info', docValueReason: 'Info' });
        allMessages.push({
          id: i + 1,
          timestamp: new Date(baseTime.getTime() + i * 60 * 1000), // 1 min apart
          author: `user${i}`,
          content: `Message ${i}`,
          channel: 'help',
        });
      }

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      // Should split into 2 conversations (5 + 5)
      expect(conversations).toHaveLength(2);
      expect(conversations[0].messageCount).toBe(5);
      expect(conversations[1].messageCount).toBe(5);
    });
  });

  describe('Conversation ID Generation', () => {
    it('should generate unique conversation IDs', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
        { messageId: 2, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'help' },
        { id: 2, timestamp: new Date(baseTime.getTime() + 30 * 60 * 1000), author: 'user2', content: 'Msg 2', channel: 'general' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations[0].id).toBeTruthy();
      expect(conversations[1].id).toBeTruthy();
      expect(conversations[0].id).not.toBe(conversations[1].id);
    });

    it('should include channel and timestamp in conversation ID', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'help' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations[0].id).toContain('help');
      expect(conversations[0].id).toContain(baseTime.getTime().toString());
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty valuable messages', async () => {
      const conversations = await (processor as any).groupIntoConversations(
        [],
        [],
        []
      );

      expect(conversations).toHaveLength(0);
    });

    it('should handle single message', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'help' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations).toHaveLength(1);
      expect(conversations[0].messageCount).toBe(1);
    });

    it('should handle null channel', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
        { messageId: 2, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: null },
        { id: 2, timestamp: new Date(baseTime.getTime() + 2 * 60 * 1000), author: 'user2', content: 'Msg 2', channel: null },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      expect(conversations).toHaveLength(1);
      expect(conversations[0].channel).toBeNull();
    });
  });

  describe('Message Metadata', () => {
    it('should preserve message metadata in conversations', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const valuableMessages = [
        {
          messageId: 1,
          category: 'troubleshooting',
          docValueReason: 'Error discussion',
          suggestedDocPage: 'errors.md',
          ragSearchCriteria: { keywords: ['error', 'timeout'] },
        },
      ];

      const allMessages = [
        {
          id: 1,
          timestamp: baseTime,
          author: 'user1',
          content: 'Getting timeout errors',
          channel: 'help'
        },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      const msg = conversations[0].messages[0];
      expect(msg.category).toBe('troubleshooting');
      expect(msg.docValueReason).toBe('Error discussion');
      expect(msg.suggestedDocPage).toBe('errors.md');
      expect(msg.ragSearchCriteria).toEqual({ keywords: ['error', 'timeout'] });
    });

    it('should track conversation time boundaries', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');
      const endTime = new Date(baseTime.getTime() + 10 * 60 * 1000);

      const valuableMessages = [
        { messageId: 1, category: 'info', docValueReason: 'Info' },
        { messageId: 2, category: 'info', docValueReason: 'Info' },
      ];

      const allMessages = [
        { id: 1, timestamp: baseTime, author: 'user1', content: 'Msg 1', channel: 'help' },
        { id: 2, timestamp: endTime, author: 'user2', content: 'Msg 2', channel: 'help' },
      ];

      const conversations = await (processor as any).groupIntoConversations(
        valuableMessages,
        allMessages,
        []
      );

      // Both messages should be in same conversation (same channel, 10min gap < 15min window)
      expect(conversations).toHaveLength(1);
      expect(conversations[0].timeStart.getTime()).toBe(baseTime.getTime());
      expect(conversations[0].timeEnd.getTime()).toBe(endTime.getTime());
      expect(conversations[0].messageCount).toBe(2);
    });
  });
});
