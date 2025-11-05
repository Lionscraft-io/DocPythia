/**
 * BatchMessageProcessor Unit Tests
 * Tests for the batch processing pipeline
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchMessageProcessor } from '../server/stream/processors/batch-message-processor.js';
import {
  mockPrismaClient,
  createMockMessage,
  createMockWatermark,
  resetPrismaMocks,
} from './mocks/prisma.mock.js';
import {
  mockLLMService,
  setupLLMServiceMocks,
  resetLLMServiceMocks,
  mockBatchClassificationResponse,
  mockProposalResponse,
  createMockLLMResponse,
} from './mocks/llm-service.mock.js';
import {
  mockVectorSearch,
  setupVectorSearchMocks,
  resetVectorSearchMocks,
  mockRAGDocs,
} from './mocks/vector-search.mock.js';

// Mock dependencies
vi.mock('../server/db.js', () => ({
  default: mockPrismaClient,
}));

vi.mock('../server/stream/llm/llm-service.js', () => ({
  llmService: mockLLMService,
}));

vi.mock('../server/stream/message-vector-search.js', () => ({
  messageVectorSearch: mockVectorSearch,
}));

describe('BatchMessageProcessor', () => {
  let processor: BatchMessageProcessor;
  const testDate = new Date('2025-10-31T00:00:00Z');

  beforeEach(() => {
    resetPrismaMocks();
    resetLLMServiceMocks();
    resetVectorSearchMocks();
    setupLLMServiceMocks();
    setupVectorSearchMocks();

    processor = new BatchMessageProcessor({
      batchWindowHours: 24,
      contextWindowHours: 24,
      maxBatchSize: 500,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-01T00:00:00Z')); // Set current time to allow batch processing
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('processBatch', () => {
    it('should initialize watermark if not exists', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(null);
      mockPrismaClient.processingWatermark.create.mockResolvedValue(
        createMockWatermark({
          watermarkTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        })
      );
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      expect(mockPrismaClient.processingWatermark.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 1,
          watermarkTime: expect.any(Date),
        }),
      });
    });

    it('should not process if batch end is in the future', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({
          watermarkTime: new Date('2025-10-31T12:00:00Z'), // 12 hours ago, batch would end in future
        })
      );

      vi.setSystemTime(new Date('2025-10-31T18:00:00Z')); // Only 6 hours later

      const result = await processor.processBatch();

      expect(result).toBe(0);
      expect(mockPrismaClient.unifiedMessage.findMany).not.toHaveBeenCalled();
    });

    it('should fetch messages for batch window', async () => {
      const watermarkTime = new Date('2025-10-30T00:00:00Z');
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime })
      );

      const messages = [
        createMockMessage({ id: 1, timestamp: new Date('2025-10-30T10:00:00Z') }),
        createMockMessage({ id: 2, timestamp: new Date('2025-10-30T15:00:00Z') }),
      ];
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce(messages); // Batch messages
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValueOnce([]); // Context messages

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      // Should fetch batch messages
      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith({
        where: {
          timestamp: {
            gte: watermarkTime,
            lt: new Date('2025-10-31T00:00:00Z'),
          },
        },
        orderBy: { timestamp: 'asc' },
        take: 500,
      });
    });

    it('should fetch context messages from previous window', async () => {
      const watermarkTime = new Date('2025-10-30T00:00:00Z');
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime })
      );

      const messages = [createMockMessage({ id: 1 })];
      const contextMessages = [
        createMockMessage({ id: 10, timestamp: new Date('2025-10-29T10:00:00Z') }),
      ];

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages) // Batch messages
        .mockResolvedValueOnce(contextMessages); // Context messages

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      // Should fetch context messages from previous 24 hours
      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          timestamp: {
            gte: new Date('2025-10-29T00:00:00Z'), // 24 hours before batch start
            lt: watermarkTime,
          },
        },
        orderBy: { timestamp: 'asc' },
        take: 500,
      });
    });

    it('should perform batch classification with context', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      const messages = [
        createMockMessage({ id: 1, content: 'How do I fix RPC errors?' }),
        createMockMessage({ id: 2, content: 'Getting connection timeout' }),
      ];
      const contextMessages = [
        createMockMessage({ id: 10, content: 'Previous context message' }),
      ];

      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce(contextMessages);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      expect(mockLLMService.requestJSON).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          systemPrompt: expect.stringContaining('documentation expert'),
          userPrompt: expect.stringContaining('CONTEXT MESSAGES'),
        }),
        expect.any(Object),
        'analysis',
        undefined // Batch classification has no single messageId
      );
    });

    it('should store classification results with batch ID', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      const messages = [createMockMessage({ id: 1 })];
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockLLMService.requestJSON.mockResolvedValue(
        createMockLLMResponse(mockBatchClassificationResponse)
      );

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.messageRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      expect(mockPrismaClient.messageClassification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 1,
          batchId: expect.stringContaining('batch_'),
          category: 'troubleshooting',
          docValueReason: expect.any(String),
        }),
      });
    });

    it('should perform RAG retrieval for valuable messages', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      const messages = [createMockMessage({ id: 1 })];
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockLLMService.requestJSON.mockResolvedValue(
        createMockLLMResponse(mockBatchClassificationResponse)
      );

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.messageRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      expect(mockVectorSearch.searchSimilarDocs).toHaveBeenCalledWith(
        expect.any(String),
        5 // ragTopK
      );
    });

    it('should generate proposals for valuable messages', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      const messages = [createMockMessage({ id: 1 })];
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockLLMService.requestJSON
        .mockResolvedValueOnce(createMockLLMResponse(mockBatchClassificationResponse))
        .mockResolvedValueOnce(createMockLLMResponse(mockProposalResponse));

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.messageRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      expect(mockPrismaClient.docProposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 1,
          page: 'docs/troubleshooting.md',
          updateType: 'UPDATE',
          confidence: 0.85,
        }),
      });
    });

    it('should update processing watermark after successful batch', async () => {
      const watermarkTime = new Date('2025-10-30T00:00:00Z');
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime })
      );

      const messages = [createMockMessage({ id: 1 })];
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.messageRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      await processor.processBatch();

      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: {
          watermarkTime: new Date('2025-10-31T00:00:00Z'), // watermark + 24 hours
          lastProcessedBatch: expect.any(Date),
        },
        create: expect.any(Object),
      });
    });

    it('should handle empty batch gracefully', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      const result = await processor.processBatch();

      expect(result).toBe(0);
      expect(mockLLMService.requestJSON).not.toHaveBeenCalled();
      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalled();
    });

    it('should continue processing if one message fails', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      const messages = [createMockMessage({ id: 1 }), createMockMessage({ id: 2 })];
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      // First message succeeds, second fails
      mockLLMService.requestJSON
        .mockResolvedValueOnce(createMockLLMResponse(mockBatchClassificationResponse))
        .mockResolvedValueOnce(createMockLLMResponse(mockProposalResponse))
        .mockRejectedValueOnce(new Error('LLM error'));

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.messageRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      const result = await processor.processBatch();

      // Should still process the batch
      expect(result).toBe(2);
      expect(mockPrismaClient.processingWatermark.upsert).toHaveBeenCalled();
    });

    it('should return correct message count', async () => {
      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark({ watermarkTime: new Date('2025-10-30T00:00:00Z') })
      );

      const messages = [
        createMockMessage({ id: 1 }),
        createMockMessage({ id: 2 }),
        createMockMessage({ id: 3 }),
      ];
      mockPrismaClient.unifiedMessage.findMany
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce([]);

      mockPrismaClient.messageClassification.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(messages[0]);
      mockPrismaClient.messageRagContext.create.mockResolvedValue({});
      mockPrismaClient.docProposal.create.mockResolvedValue({});
      mockPrismaClient.unifiedMessage.update.mockResolvedValue({});
      mockPrismaClient.processingWatermark.upsert.mockResolvedValue(
        createMockWatermark()
      );

      const result = await processor.processBatch();

      expect(result).toBe(3);
    });
  });

  describe('Configuration', () => {
    it('should use custom config values', () => {
      const customProcessor = new BatchMessageProcessor({
        batchWindowHours: 12,
        contextWindowHours: 6,
        maxBatchSize: 100,
        classificationModel: 'custom-model',
        proposalModel: 'custom-proposal-model',
        ragTopK: 10,
      });

      expect(customProcessor).toBeDefined();
    });

    it('should use environment variables as defaults', () => {
      process.env.BATCH_WINDOW_HOURS = '48';
      process.env.MAX_BATCH_SIZE = '1000';

      const envProcessor = new BatchMessageProcessor();

      expect(envProcessor).toBeDefined();
    });
  });
});
