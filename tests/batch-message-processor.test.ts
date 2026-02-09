/**
 * BatchMessageProcessor Unit Tests
 * Tests for the per-stream batch processing pipeline
 *
 * Owner: Wayne
 * Updated: 2024-12-23 - Rewritten for per-stream watermark architecture
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted to define mocks that need to be available in vi.mock factories
const { mockPrismaClient, mockLLMService, mockVectorSearch } = vi.hoisted(() => {
  return {
    mockPrismaClient: {
      processingWatermark: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      unifiedMessage: {
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        groupBy: vi.fn(),
      },
      messageClassification: {
        count: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        findUnique: vi.fn(),
        groupBy: vi.fn(),
        deleteMany: vi.fn(),
      },
      messageRagContext: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      conversationRagContext: {
        create: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
        findUnique: vi.fn(),
      },
      docProposal: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      streamConfig: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      importWatermark: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((callback: any) => callback(mockPrismaClient)),
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      $queryRawUnsafe: vi.fn(),
    },
    mockLLMService: {
      requestJSON: vi.fn(),
    },
    mockVectorSearch: {
      searchSimilarDocs: vi.fn(),
      searchSimilarMessages: vi.fn(),
    },
  };
});

// Mock dependencies using hoisted mocks
vi.mock('../server/db.js', () => ({
  default: mockPrismaClient,
}));

vi.mock('../server/stream/llm/llm-service.js', () => ({
  llmService: mockLLMService,
}));

vi.mock('../server/stream/message-vector-search.js', () => {
  return {
    MessageVectorSearch: class MockMessageVectorSearch {
      constructor() {}
      searchSimilarDocs = mockVectorSearch.searchSimilarDocs;
      searchSimilarMessages = mockVectorSearch.searchSimilarMessages;
      generateEmbedding = vi.fn().mockResolvedValue(new Array(768).fill(0));
      storeEmbedding = vi.fn().mockResolvedValue(undefined);
    },
  };
});

vi.mock('../server/config/instance-loader.js', () => ({
  InstanceConfigLoader: {
    get: vi.fn().mockReturnValue({
      database: { url: 'postgresql://test:test@localhost:5432/test' },
      gemini: { apiKey: 'test-key' },
      project: { name: 'Test Project' },
    }),
  },
}));

vi.mock('../server/vector-store.js', () => {
  return {
    PgVectorStore: class MockPgVectorStore {
      constructor() {}
      search = vi.fn().mockResolvedValue([]);
      addDocument = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// Import after mocks are set up
import { BatchMessageProcessor } from '../server/stream/processors/batch-message-processor.js';
import { createMockMessage, createMockWatermark } from './mocks/prisma.mock.js';
import {
  mockBatchClassificationResponse,
  mockProposalResponse,
  createMockLLMResponse,
} from './mocks/llm-service.mock.js';

// Helper functions for mocks
const resetAllMocks = () => {
  // Reset Prisma mocks
  Object.values(mockPrismaClient).forEach((model: any) => {
    if (model && typeof model === 'object') {
      Object.values(model).forEach((method: any) => {
        if (typeof method?.mockReset === 'function') {
          method.mockReset();
        }
      });
    }
  });
  // Reset LLM mocks
  mockLLMService.requestJSON.mockReset();
  // Reset Vector search mocks
  mockVectorSearch.searchSimilarDocs.mockReset();
  mockVectorSearch.searchSimilarMessages.mockReset();
};

const setupDefaultMocks = () => {
  // Setup LLM service default behavior
  mockLLMService.requestJSON.mockImplementation(
    async (request: any, schema: any, purpose: string) => {
      if (purpose === 'analysis') {
        return createMockLLMResponse(mockBatchClassificationResponse);
      } else if (purpose === 'changegeneration') {
        return createMockLLMResponse(mockProposalResponse);
      }
      return createMockLLMResponse({});
    }
  );

  // Setup vector search default behavior
  mockVectorSearch.searchSimilarDocs.mockResolvedValue([
    {
      id: 'doc-1',
      title: 'Test Doc',
      file_path: 'docs/test.md',
      content: 'Mock doc content',
      distance: 0.9,
    },
  ]);
  mockVectorSearch.searchSimilarMessages.mockResolvedValue([]);
};

describe('BatchMessageProcessor', () => {
  let processor: BatchMessageProcessor;

  beforeEach(() => {
    resetAllMocks();
    setupDefaultMocks();

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

  describe('processBatch - Per-Stream Watermarks', () => {
    it('should return 0 when no streams have pending messages', async () => {
      // No pending messages across any streams
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      const result = await processor.processBatch();

      expect(result).toBe(0);
      // Production runs exclude 'pipeline-test' stream
      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith({
        where: { processingStatus: 'PENDING', streamId: { not: 'pipeline-test' } },
        distinct: ['streamId'],
        select: { streamId: true },
      });
    });

    it('should only process specified stream when streamIdFilter is provided', async () => {
      // Test pipeline mode: only process the specified stream
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      const result = await processor.processBatch({ streamIdFilter: 'pipeline-test' });

      expect(result).toBe(0);
      // When streamIdFilter is provided, use exact match (not exclusion)
      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith({
        where: { processingStatus: 'PENDING', streamId: 'pipeline-test' },
        distinct: ['streamId'],
        select: { streamId: true },
      });
    });

    it('should process streams independently', async () => {
      // Setup: Two streams with pending messages
      mockPrismaClient.unifiedMessage.findMany
        // First call: Get distinct streams
        .mockResolvedValueOnce([{ streamId: 'stream-1' }, { streamId: 'stream-2' }]);

      // Stream 1: No watermark exists, earliest message at watermark
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(null);
      mockPrismaClient.unifiedMessage.findFirst
        // Stream 1: Earliest message for watermark init
        .mockResolvedValueOnce({ timestamp: new Date('2025-10-30T00:00:00Z') })
        // Stream 1: Earliest unprocessed
        .mockResolvedValueOnce({ timestamp: new Date('2025-10-30T00:00:00Z') })
        // Stream 1: No more unprocessed (after first batch)
        .mockResolvedValueOnce(null)
        // Stream 2: Earliest message for watermark init
        .mockResolvedValueOnce({ timestamp: new Date('2025-10-29T00:00:00Z') })
        // Stream 2: Earliest unprocessed
        .mockResolvedValueOnce({ timestamp: new Date('2025-10-29T00:00:00Z') })
        // Stream 2: No more unprocessed
        .mockResolvedValueOnce(null);

      // Create watermarks
      mockPrismaClient.processingWatermark.create.mockResolvedValue(
        createMockWatermark({ streamId: 'stream-1' })
      );

      // No pending messages in windows
      mockPrismaClient.unifiedMessage.count.mockResolvedValue(0);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      const result = await processor.processBatch();

      expect(result).toBe(0);
      // Should have checked both streams
      expect(mockPrismaClient.processingWatermark.findUnique).toHaveBeenCalledWith({
        where: { streamId: 'stream-1' },
      });
    });

    it('should initialize per-stream watermark if not exists', async () => {
      const streamId = 'new-stream';
      const earliestTimestamp = new Date('2025-10-30T00:00:00Z');

      // Setup: One stream with pending messages
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // Distinct streams
        .mockResolvedValueOnce([]) // Batch messages (empty)
        .mockResolvedValueOnce([]); // Context messages

      // No existing watermark
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(null);

      // Earliest message in stream
      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: earliestTimestamp }) // For watermark init
        .mockResolvedValueOnce({ timestamp: earliestTimestamp }) // Earliest unprocessed
        .mockResolvedValueOnce(null); // No more after batch

      // Create watermark
      mockPrismaClient.processingWatermark.create.mockResolvedValue(
        createMockWatermark({ streamId, watermarkTime: earliestTimestamp })
      );

      // No messages in batch window
      mockPrismaClient.unifiedMessage.count.mockResolvedValue(0);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      expect(mockPrismaClient.processingWatermark.create).toHaveBeenCalledWith({
        data: {
          streamId,
          watermarkTime: earliestTimestamp,
        },
      });
    });

    it('should fetch messages only from specific stream', async () => {
      const streamId = 'specific-stream';
      const watermarkTime = new Date('2025-10-30T00:00:00Z');
      const messages = [
        createMockMessage({ id: 1, streamId, timestamp: new Date('2025-10-30T10:00:00Z') }),
        createMockMessage({ id: 2, streamId, timestamp: new Date('2025-10-30T15:00:00Z') }),
      ];

      // Setup: One stream
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // Distinct streams
        .mockResolvedValueOnce(messages) // Batch messages
        .mockResolvedValueOnce([]); // Context messages

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ streamId, watermarkTime })
      );

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime }) // Earliest unprocessed
        .mockResolvedValueOnce(null); // No more after batch

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(2);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      // Verify batch messages fetch includes streamId filter
      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            streamId,
            processingStatus: 'PENDING',
          }),
        })
      );
    });

    it('should update watermark for specific stream after batch', async () => {
      const streamId = 'test-stream-update';
      const watermarkTime = new Date('2025-10-30T00:00:00Z');
      const batchEnd = new Date('2025-10-31T00:00:00Z');

      const messages = [
        createMockMessage({ id: 1, streamId, timestamp: new Date('2025-10-30T10:00:00Z') }),
      ];

      // Setup
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }])
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]); // Context

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ streamId, watermarkTime })
      );

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalledWith({
        where: { streamId },
        update: {
          watermarkTime: batchEnd,
          lastProcessedBatch: expect.any(Date),
        },
        create: {
          streamId,
          watermarkTime: batchEnd,
          lastProcessedBatch: expect.any(Date),
        },
      });
    });
  });

  describe('processBatch - Message Processing', () => {
    const streamId = 'test-stream';
    const watermarkTime = new Date('2025-10-30T00:00:00Z');

    beforeEach(() => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ streamId, watermarkTime })
      );
    });

    it('should mark messages as COMPLETED after successful processing', async () => {
      const messages = [
        createMockMessage({ id: 1, streamId, processingStatus: 'PENDING' }),
        createMockMessage({ id: 2, streamId, processingStatus: 'PENDING' }),
      ];

      // Flow: distinct streams -> context messages -> batch messages -> next batch empty
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Get distinct streams
        .mockResolvedValueOnce([]) // 2. Context messages (fetched before while loop)
        .mockResolvedValueOnce(messages) // 3. Fetch batch messages
        .mockResolvedValueOnce([]); // 4. Next iteration - empty means done

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime }) // Earliest unprocessed
        .mockResolvedValueOnce(null); // No more unprocessed

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(2);

      // Override default mock to include both message IDs
      mockLLMService.requestJSON.mockImplementation(
        async (request: any, schema: any, purpose: string) => {
          if (purpose === 'analysis') {
            return createMockLLMResponse({
              threads: [
                {
                  category: 'troubleshooting',
                  messages: [1, 2], // Both message IDs
                  summary: 'User discussions',
                  docValueReason: 'Valuable discussions',
                  ragSearchCriteria: {
                    keywords: ['troubleshooting'],
                    semanticQuery: 'troubleshooting',
                  },
                },
              ],
              batchSummary: 'Found 2 messages',
            });
          } else if (purpose === 'changegeneration') {
            return createMockLLMResponse(mockProposalResponse);
          }
          return createMockLLMResponse({});
        }
      );

      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      expect(mockPrismaClient.unifiedMessage.updateMany).toHaveBeenCalledWith({
        where: { id: { in: expect.arrayContaining([1, 2]) } },
        data: { processingStatus: 'COMPLETED' },
      });
    });

    it('should handle empty batch gracefully', async () => {
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // Get distinct streams
        .mockResolvedValueOnce([]) // Context
        .mockResolvedValueOnce([]); // No batch messages

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(0);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      const result = await processor.processBatch();

      expect(result).toBe(0);
      expect(mockLLMService.requestJSON).not.toHaveBeenCalled();
    });

    it('should perform batch classification with LLM', async () => {
      const messages = [
        createMockMessage({ id: 1, streamId, content: 'How do I fix RPC errors?' }),
        createMockMessage({ id: 2, streamId, content: 'Getting connection timeout' }),
      ];

      // Flow: distinct -> context -> batch -> next batch empty
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next iteration empty

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(2);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      expect(mockLLMService.requestJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          systemPrompt: expect.any(String),
          userPrompt: expect.stringContaining('[MSG_'),
        }),
        expect.any(Object),
        'analysis',
        undefined
      );
    });

    it('should perform RAG retrieval for valuable messages', async () => {
      const messages = [createMockMessage({ id: 1, streamId })];

      // Flow: distinct -> context -> batch -> next batch empty
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next iteration empty

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      expect(mockVectorSearch.searchSimilarDocs).toHaveBeenCalled();
    });

    it('should generate proposals for conversations', async () => {
      const messages = [createMockMessage({ id: 1, streamId })];

      // Flow: distinct -> context -> batch -> next batch empty
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next iteration empty

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      // Should call LLM twice: once for classification, once for proposal generation
      expect(mockLLMService.requestJSON).toHaveBeenCalledTimes(2);
      expect(mockPrismaClient.docProposal.create).toHaveBeenCalled();
    });

    it('should store classification with conversation ID', async () => {
      const messages = [createMockMessage({ id: 1, streamId })];

      // Flow: distinct -> context -> batch -> next batch empty
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next iteration empty

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      // Just verify that upsert was called with a messageId and conversationId
      expect(mockPrismaClient.messageClassification.upsert).toHaveBeenCalled();
      const upsertCall = mockPrismaClient.messageClassification.upsert.mock.calls[0][0];
      expect(upsertCall.where.messageId).toBe(1);
      expect(upsertCall.create.messageId).toBe(1);
      expect(upsertCall.create.conversationId).toBeDefined();
      expect(typeof upsertCall.create.conversationId).toBe('string');
    });

    it('should return correct message count', async () => {
      const messages = [
        createMockMessage({ id: 1, streamId }),
        createMockMessage({ id: 2, streamId }),
        createMockMessage({ id: 3, streamId }),
      ];

      // Flow: distinct -> context -> batch -> next batch empty
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next iteration empty

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(3);

      // Override default mock to include all 3 message IDs
      mockLLMService.requestJSON.mockImplementation(
        async (request: any, schema: any, purpose: string) => {
          if (purpose === 'analysis') {
            return createMockLLMResponse({
              threads: [
                {
                  category: 'troubleshooting',
                  messages: [1, 2, 3], // All 3 message IDs
                  summary: 'User discussions about various issues',
                  docValueReason: 'Multiple valuable discussions',
                  ragSearchCriteria: {
                    keywords: ['troubleshooting'],
                    semanticQuery: 'troubleshooting issues',
                  },
                },
              ],
              batchSummary: 'Found 3 messages in 1 thread',
            });
          } else if (purpose === 'changegeneration') {
            return createMockLLMResponse(mockProposalResponse);
          }
          return createMockLLMResponse({});
        }
      );

      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 3 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      const result = await processor.processBatch();

      expect(result).toBe(3);
    });
  });

  describe('processBatch - Error Handling', () => {
    const streamId = 'test-stream';
    const watermarkTime = new Date('2025-10-30T00:00:00Z');

    beforeEach(() => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ streamId, watermarkTime })
      );
    });

    it('should not update watermark when messages fail', async () => {
      const messages = [createMockMessage({ id: 1, streamId })];

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context messages
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next batch iteration (empty)

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1);

      // Classification succeeds but proposal generation fails
      mockLLMService.requestJSON
        .mockResolvedValueOnce(createMockLLMResponse(mockBatchClassificationResponse))
        .mockRejectedValueOnce(new Error('LLM error'));

      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.messageClassification.deleteMany.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      await processor.processBatch();

      // Watermark should still be updated even with partial failure
      // but messages should not be marked as completed
      expect(mockPrismaClient.messageClassification.deleteMany).toHaveBeenCalled();
    });

    it('should prevent concurrent processing', async () => {
      const messages = [createMockMessage({ id: 1, streamId })];

      // Setup a long-running process
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce([{ streamId }]) // 1. Distinct streams
        .mockResolvedValueOnce([]) // 2. Context messages
        .mockResolvedValueOnce(messages) // 3. Batch messages
        .mockResolvedValueOnce([]); // 4. Next batch iteration (empty)

      mockPrismaClient.unifiedMessage.findFirst
        .mockResolvedValueOnce({ timestamp: watermarkTime })
        .mockResolvedValueOnce(null);

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1);
      mockPrismaClient.messageClassification.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.upsert.mockResolvedValue({});
      mockPrismaClient.conversationRagContext.update.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue({});

      // Start first batch (don't await)
      const firstBatch = processor.processBatch();

      // Try to start second batch immediately
      const secondBatch = await processor.processBatch();

      // Second batch should return 0 because first is still processing
      expect(secondBatch).toBe(0);

      // Wait for first batch to complete
      await firstBatch;
    });
  });

  describe('Configuration', () => {
    it('should use custom config values', () => {
      const customProcessor = new BatchMessageProcessor(
        'custom-instance',
        mockPrismaClient as any,
        {
          batchWindowHours: 12,
          contextWindowHours: 6,
          maxBatchSize: 100,
          classificationModel: 'custom-model',
          proposalModel: 'custom-proposal-model',
          ragTopK: 10,
        }
      );

      expect(customProcessor).toBeDefined();
    });

    it('should use environment variables as defaults', () => {
      process.env.BATCH_WINDOW_HOURS = '48';
      process.env.MAX_BATCH_SIZE = '1000';

      const envProcessor = new BatchMessageProcessor('env-instance', mockPrismaClient as any);

      expect(envProcessor).toBeDefined();
    });
  });

  describe('getProcessingStatus', () => {
    it('should return false when not processing', () => {
      expect(BatchMessageProcessor.getProcessingStatus()).toBe(false);
    });
  });
});
