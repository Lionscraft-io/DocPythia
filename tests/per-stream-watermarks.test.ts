/**
 * Per-Stream Watermarks Unit Tests
 * Tests for independent watermark handling across multiple streams
 *
 * Critical behavior tested:
 * - Streams process independently with separate watermarks
 * - Historical messages from new streams aren't skipped
 * - Zulip topics properly included in conversation IDs
 * - Watermark advancement is stream-specific
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Set up mocks using factory functions (hoisted to top)
vi.mock('../server/db.js', async () => {
  const { mockPrismaClient } = await import('./mocks/prisma.mock.js');
  return { default: mockPrismaClient };
});

vi.mock('../server/stream/llm/llm-service.js', async () => {
  const { mockLLMService } = await import('./mocks/llm-service.mock.js');
  return { llmService: mockLLMService };
});

vi.mock('../server/stream/message-vector-search.js', () => {
  return {
    MessageVectorSearch: class {
      searchSimilarDocs = vi.fn().mockResolvedValue([]);
      storeEmbedding = vi.fn().mockResolvedValue(undefined);
      hasEmbedding = vi.fn().mockResolvedValue(true);
      getEmbeddedMessagesCount = vi.fn().mockResolvedValue(100);
    },
  };
});

// Import the module under test AFTER mocks are declared
import { BatchMessageProcessor } from '../server/stream/processors/batch-message-processor.js';

// Import mocks after vi.mock() calls
import { mockPrismaClient, createMockMessage, resetPrismaMocks } from './mocks/prisma.mock.js';
import {
  mockLLMService,
  setupLLMServiceMocks,
  resetLLMServiceMocks,
  mockBatchClassificationResponse,
  createMockLLMResponse,
} from './mocks/llm-service.mock.js';
import {
  mockVectorSearch,
  setupVectorSearchMocks,
  resetVectorSearchMocks,
} from './mocks/vector-search.mock.js';

// Helper to create per-stream watermark
const createMockWatermark = (streamId: string, overrides = {}) => ({
  id: Math.floor(Math.random() * 10000),
  streamId,
  watermarkTime: new Date('2025-10-31T00:00:00Z'),
  lastProcessedBatch: new Date('2025-10-30T00:00:00Z'),
  updatedAt: new Date(),
  ...overrides,
});

// REDUNDANT: These tests are largely covered by batch-message-processor.test.ts
// which achieves 89.64% coverage of the same code (batch-message-processor.ts)
// Keeping skipped to avoid test maintenance overhead for duplicate coverage
// Owner: Wayne
describe.skip('Per-Stream Watermarks (Redundant - see batch-message-processor.test.ts)', () => {
  let processor: BatchMessageProcessor;

  beforeEach(() => {
    // Clear mock call history but keep mock functions
    vi.clearAllMocks();

    setupLLMServiceMocks();
    setupVectorSearchMocks();

    processor = new BatchMessageProcessor('test-instance', mockPrismaClient as any, {
      batchWindowHours: 24,
      contextWindowHours: 24,
      maxBatchSize: 500,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Watermark Initialization', () => {
    it('should initialize watermark for new stream using earliest message timestamp', async () => {
      const streamId = 'projecta-zulip-community-support';

      // Mock: distinct streams query
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      // Mock: no existing watermark
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(null);

      // Mock: earliest message from Jan 2024
      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(
          createMockMessage({
            streamId,
            timestamp: new Date('2024-01-15T10:00:00Z')
          })
        )
        .mockResolvedValueOnce(null); // No more unprocessed after watermark

      // Mock: watermark creation
      mockPrismaClient.processingWatermark.create.mockResolvedValue(
        createMockWatermark(streamId, {
          watermarkTime: new Date('2024-01-15T10:00:00Z')
        })
      );

      // Mock: no messages to process yet
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(streamId)
      );

      await processor.processBatch();

      // Verify watermark was created with earliest message timestamp
      expect(mockPrismaClient.processingWatermark.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          streamId,
          watermarkTime: new Date('2024-01-15T10:00:00Z')
        }),
      });
    });

    it('should initialize watermark with 7-day default when stream has no messages', async () => {
      const streamId = 'empty-stream';
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(null);

      // No messages in this stream
      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(null) // No earliest message
        .mockResolvedValueOnce(null); // No unprocessed messages

      mockPrismaClient.processingWatermark.create.mockResolvedValue(
        createMockWatermark(streamId, { watermarkTime: sevenDaysAgo })
      );

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(streamId)
      );

      await processor.processBatch();

      expect(mockPrismaClient.processingWatermark.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          streamId,
          watermarkTime: expect.any(Date)
        }),
      });

      const createCall = mockPrismaClient.processingWatermark.create.mock.calls[0][0];
      const createdWatermark = createCall.data.watermarkTime;

      // Should be approximately 7 days ago (within 1 hour tolerance)
      expect(createdWatermark.getTime()).toBeGreaterThan(sevenDaysAgo.getTime() - 3600000);
      expect(createdWatermark.getTime()).toBeLessThan(sevenDaysAgo.getTime() + 3600000);
    });

    it('should initialize independent watermarks for multiple streams', async () => {
      const streams = [
        { id: 'projecta-zulip-community-support', earliestMsg: new Date('2024-01-15T10:00:00Z') },
        { id: 'projecta-telegram', earliestMsg: new Date('2025-10-29T12:00:00Z') },
        { id: 'projecta-discord-dev-chat', earliestMsg: new Date('2025-09-01T08:00:00Z') },
      ];

      // Mock distinct streams
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce(
        streams.map(s => ({ streamId: s.id }))
      );

      let watermarkCallCount = 0;
      let earliestMsgCallCount = 0;

      mockPrismaClient.processingWatermark.findUnique.mockImplementation(() => {
        watermarkCallCount++;
        return Promise.resolve(null); // No existing watermarks
      });

      mockPrismaClient.unifiedMessage.findFirst.mockImplementation(() => {
        const streamIndex = Math.floor(earliestMsgCallCount / 2); // Each stream gets 2 calls
        const stream = streams[streamIndex];
        earliestMsgCallCount++;

        if (earliestMsgCallCount % 2 === 1) {
          // First call: earliest message
          return Promise.resolve(createMockMessage({
            streamId: stream.id,
            timestamp: stream.earliestMsg
          }));
        } else {
          // Second call: no unprocessed after init
          return Promise.resolve(null);
        }
      });

      mockPrismaClient.processingWatermark.create.mockImplementation((args) => {
        return Promise.resolve(createMockWatermark(args.data.streamId, {
          watermarkTime: args.data.watermarkTime
        }));
      });

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark('any-stream')
      );

      await processor.processBatch();

      // Verify watermark created for each stream with its own timestamp
      expect(mockPrismaClient.processingWatermark.create).toHaveBeenCalledTimes(3);

      streams.forEach(stream => {
        expect(mockPrismaClient.processingWatermark.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            streamId: stream.id,
            watermarkTime: stream.earliestMsg
          }),
        });
      });
    });
  });

  describe('Stream Isolation in Message Fetching', () => {
    it('should fetch messages only from specified stream', async () => {
      const zulipStreamId = 'projecta-zulip-community-support';
      const telegramStreamId = 'projecta-telegram';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId: zulipStreamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(zulipStreamId, {
          watermarkTime: new Date('2024-01-15T00:00:00Z')
        })
      );

      const zulipMessages = [
        createMockMessage({
          streamId: zulipStreamId,
          timestamp: new Date('2024-01-15T10:00:00Z'),
          content: 'Zulip message'
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(zulipMessages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId: zulipStreamId }]) // distinct streams
        .mockResolvedValueOnce(zulipMessages) // batch messages
        .mockResolvedValueOnce([]); // context messages

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(zulipMessages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(zulipStreamId)
      );

      await processor.processBatch();

      // Verify batch message fetch included streamId filter
      const batchFetchCall = mockPrismaClient.unifiedMessage.findMany.mock.calls.find(
        call => call[0].where?.streamId === zulipStreamId &&
               call[0].where?.processingStatus === 'PENDING'
      );

      expect(batchFetchCall).toBeDefined();
      expect(batchFetchCall[0].where).toEqual(
        expect.objectContaining({
          streamId: zulipStreamId,
          processingStatus: 'PENDING',
          timestamp: expect.any(Object)
        })
      );
    });

    it('should fetch context messages only from same stream', async () => {
      const streamId = 'projecta-zulip-community-support';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(streamId, {
          watermarkTime: new Date('2024-01-16T00:00:00Z')
        })
      );

      const messages = [
        createMockMessage({
          streamId,
          timestamp: new Date('2024-01-16T10:00:00Z')
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(messages[0])
        .mockResolvedValueOnce(null);

      const contextMessages = [
        createMockMessage({
          streamId,
          timestamp: new Date('2024-01-15T12:00:00Z'),
          content: 'Context message from same stream'
        }),
      ];

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce(contextMessages);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(streamId)
      );

      await processor.processBatch();

      // Find context messages fetch call
      const contextFetchCall = mockPrismaClient.unifiedMessage.findMany.mock.calls.find(
        call => call[0].where?.streamId === streamId &&
               call[0].where?.timestamp?.lt instanceof Date &&
               call[0].where?.processingStatus === 'COMPLETED'
      );

      expect(contextFetchCall).toBeDefined();
      expect(contextFetchCall[0].where).toEqual(
        expect.objectContaining({
          streamId,
          processingStatus: 'COMPLETED'
        })
      );
    });
  });

  describe('Independent Watermark Advancement', () => {
    it('should advance watermark only for processed stream', async () => {
      const zulipStreamId = 'projecta-zulip-community-support';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId: zulipStreamId }
      ]);

      const initialWatermark = new Date('2024-01-15T00:00:00Z');
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(zulipStreamId, {
          watermarkTime: initialWatermark
        })
      );

      const messages = [
        createMockMessage({
          streamId: zulipStreamId,
          timestamp: new Date('2024-01-15T10:00:00Z')
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(messages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId: zulipStreamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(zulipStreamId)
      );

      await processor.processBatch();

      // Verify watermark update was called with correct streamId
      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalledWith({
        where: { streamId: zulipStreamId },
        update: {
          watermarkTime: new Date('2024-01-16T00:00:00Z'), // +24 hours
          lastProcessedBatch: expect.any(Date),
        },
        create: expect.objectContaining({
          streamId: zulipStreamId,
          watermarkTime: expect.any(Date),
        }),
      });
    });

    it('should not affect other stream watermarks when processing one stream', async () => {
      const zulipStreamId = 'projecta-zulip-community-support';
      const telegramStreamId = 'projecta-telegram';

      // Process only Zulip stream
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId: zulipStreamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(zulipStreamId, {
          watermarkTime: new Date('2024-01-15T00:00:00Z')
        })
      );

      const messages = [
        createMockMessage({
          streamId: zulipStreamId,
          timestamp: new Date('2024-01-15T10:00:00Z')
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(messages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId: zulipStreamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(zulipStreamId)
      );

      await processor.processBatch();

      // Verify no calls made to Telegram stream watermark
      const upsertCalls = mockPrismaClient.processingWatermark.upsert.mock.calls;
      const telegramWatermarkUpdates = upsertCalls.filter(
        call => call[0].where.streamId === telegramStreamId
      );

      expect(telegramWatermarkUpdates).toHaveLength(0);
    });
  });

  describe('Zulip Topic Handling', () => {
    it('should include Zulip topics in conversation IDs', async () => {
      const streamId = 'projecta-zulip-community-support';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(streamId, {
          watermarkTime: new Date('2024-01-15T00:00:00Z')
        })
      );

      const messages = [
        createMockMessage({
          streamId,
          timestamp: new Date('2024-01-15T10:00:00Z'),
          content: 'Message about RPC issues',
          channel: 'community-support',
          metadata: { topic: 'RPC Connection Problems' }
        }),
        createMockMessage({
          id: 2,
          streamId,
          timestamp: new Date('2024-01-15T10:05:00Z'),
          content: 'Follow-up about RPC',
          channel: 'community-support',
          metadata: { topic: 'RPC Connection Problems' }
        }),
        createMockMessage({
          id: 3,
          streamId,
          timestamp: new Date('2024-01-15T11:00:00Z'),
          content: 'Different topic',
          channel: 'community-support',
          metadata: { topic: 'Staking Questions' }
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(messages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      let classificationCallCount = 0;
      mockPrismaClient.messageClassification.create.mockImplementation((args) => {
        const conversationId = args.data.conversationId;

        // Verify conversation IDs include topics
        if (classificationCallCount < 2) {
          // First two messages should have same conversation ID (same topic)
          expect(conversationId).toContain('RPC-Connection-Problems');
        } else {
          // Third message should have different conversation ID (different topic)
          expect(conversationId).toContain('Staking-Questions');
        }

        classificationCallCount++;
        return Promise.resolve({
          id: classificationCallCount,
          conversationId,
        });
      });

      mockPrismaClient.unifiedMessage.findUnique.mockImplementation((args) => {
        return Promise.resolve(messages.find(m => m.id === args.where.id));
      });

      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(streamId)
      );

      await processor.processBatch();

      expect(mockPrismaClient.messageClassification.create).toHaveBeenCalledTimes(3);
    });

    it('should include Zulip topics in LLM message format', async () => {
      const streamId = 'projecta-zulip-community-support';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(streamId, {
          watermarkTime: new Date('2024-01-15T00:00:00Z')
        })
      );

      const messages = [
        createMockMessage({
          streamId,
          timestamp: new Date('2024-01-15T10:00:00Z'),
          content: 'How do I fix RPC errors?',
          channel: 'community-support',
          author: 'alice@example.com',
          metadata: { topic: 'Troubleshooting' }
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(messages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(streamId)
      );

      await processor.processBatch();

      // Verify LLM was called with topic in message format
      expect(mockLLMService.requestJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('[Topic: Troubleshooting]')
        }),
        expect.any(Object),
        'analysis',
        undefined
      );
    });
  });

  describe('Historical Data Preservation', () => {
    it('should not skip old Zulip messages when Telegram has recent watermark', async () => {
      // Scenario: Telegram processed through Oct 2025, Zulip added with Jan 2024 messages
      const zulipStreamId = 'projecta-zulip-community-support';
      const telegramStreamId = 'projecta-telegram';

      // Mock: Process Zulip stream with old messages
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId: zulipStreamId }
      ]);

      // Zulip watermark should be independent, starting from Jan 2024
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(zulipStreamId, {
          watermarkTime: new Date('2024-01-15T00:00:00Z') // Old date
        })
      );

      const oldZulipMessages = [
        createMockMessage({
          streamId: zulipStreamId,
          timestamp: new Date('2024-01-15T10:00:00Z'), // From January 2024
          content: 'Old Zulip message that should NOT be skipped'
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(oldZulipMessages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId: zulipStreamId }])
        .mockResolvedValueOnce(oldZulipMessages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(oldZulipMessages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(zulipStreamId)
      );

      await processor.processBatch();

      // Verify old Zulip messages were processed
      expect(mockPrismaClient.messageClassification.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.messageClassification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchId: expect.any(String),
        }),
      });

      // Verify watermark advanced from Jan 2024
      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalledWith({
        where: { streamId: zulipStreamId },
        update: {
          watermarkTime: new Date('2024-01-16T00:00:00Z'), // Advanced 24 hours from Jan 15
          lastProcessedBatch: expect.any(Date),
        },
        create: expect.any(Object),
      });
    });

    it('should process multiple streams with vastly different watermarks simultaneously', async () => {
      const streams = [
        {
          id: 'projecta-zulip-community-support',
          watermark: new Date('2024-01-15T00:00:00Z'),
          messages: [
            createMockMessage({
              streamId: 'projecta-zulip-community-support',
              timestamp: new Date('2024-01-15T10:00:00Z'),
              content: 'Old Zulip message'
            })
          ]
        },
        {
          id: 'projecta-telegram',
          watermark: new Date('2025-10-29T00:00:00Z'),
          messages: [
            createMockMessage({
              streamId: 'projecta-telegram',
              timestamp: new Date('2025-10-29T14:00:00Z'),
              content: 'Recent Telegram message'
            })
          ]
        },
      ];

      // Process both streams
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce(
        streams.map(s => ({ streamId: s.id }))
      );

      let streamIndex = 0;
      mockPrismaClient.processingWatermark.findUnique.mockImplementation(() => {
        const stream = streams[streamIndex % streams.length];
        return Promise.resolve(createMockWatermark(stream.id, {
          watermarkTime: stream.watermark
        }));
      });

      let findFirstCallCount = 0;
      mockPrismaClient.unifiedMessage.findFirst.mockImplementation(() => {
        const stream = streams[Math.floor(findFirstCallCount / 2)];
        const result = findFirstCallCount % 2 === 0 ? stream.messages[0] : null;
        findFirstCallCount++;
        return Promise.resolve(result);
      });

      let findManyCallCount = 0;
      mockPrismaClient.unifiedMessage.findMany.mockImplementation((args) => {
        // First call is for distinct streams (already set above)
        if (findManyCallCount === 0) {
          findManyCallCount++;
          return Promise.resolve(streams.map(s => ({ streamId: s.id })));
        }

        // Batch messages
        if (args.where?.processingStatus === 'PENDING') {
          const stream = streams[Math.floor((findManyCallCount - 1) / 2)];
          findManyCallCount++;
          return Promise.resolve(stream.messages);
        }

        // Context messages
        findManyCallCount++;
        return Promise.resolve([]);
      });

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockImplementation((args) => {
        const allMessages = streams.flatMap(s => s.messages);
        return Promise.resolve(allMessages.find(m => m.id === args.where.id));
      });
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});

      let upsertCallCount = 0;
      mockPrismaClient.processingWatermark.upsert.mockImplementation((args) => {
        const stream = streams[upsertCallCount % streams.length];
        upsertCallCount++;
        streamIndex++;
        return Promise.resolve(createMockWatermark(stream.id));
      });

      await processor.processBatch();

      // Verify both streams were processed with their own watermarks
      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalledWith({
        where: { streamId: 'projecta-zulip-community-support' },
        update: {
          watermarkTime: new Date('2024-01-16T00:00:00Z'), // Jan watermark advanced
          lastProcessedBatch: expect.any(Date),
        },
        create: expect.any(Object),
      });

      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalledWith({
        where: { streamId: 'projecta-telegram' },
        update: {
          watermarkTime: new Date('2025-10-30T00:00:00Z'), // Oct watermark advanced
          lastProcessedBatch: expect.any(Date),
        },
        create: expect.any(Object),
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle stream with no pending messages gracefully', async () => {
      const streamId = 'empty-stream';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(streamId)
      );

      mockPrismaClient.unifiedMessage.findFirst.mockResolvedValue(null);
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }])
        .mockResolvedValue([]);

      const result = await processor.processBatch();

      expect(result).toBe(0);
      expect(mockLLMService.requestJSON).not.toHaveBeenCalled();
    });

    it('should handle missing topic metadata gracefully', async () => {
      const streamId = 'projecta-zulip-community-support';

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([
        { streamId }
      ]);

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark(streamId, {
          watermarkTime: new Date('2024-01-15T00:00:00Z')
        })
      );

      const messages = [
        createMockMessage({
          streamId,
          timestamp: new Date('2024-01-15T10:00:00Z'),
          content: 'Message without topic',
          channel: 'community-support',
          metadata: null // No topic
        }),
      ];

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce(messages[0])
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.conversationRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark(streamId)
      );

      await processor.processBatch();

      // Should still process successfully
      expect(mockPrismaClient.messageClassification.create).toHaveBeenCalled();
    });
  });
});
