/**
 * Admin Routes Unit Tests
 * Tests for batch processing admin API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import {
  mockPrismaClient,
  createMockMessage,
  createMockClassification,
  createMockProposal,
  createMockWatermark,
  resetPrismaMocks,
} from './mocks/prisma.mock.js';

// Mock dependencies
vi.mock('../server/db.js', () => ({
  default: mockPrismaClient,
}));

const mockBatchProcessor = {
  processBatch: vi.fn(),
};

vi.mock('../server/stream/processors/batch-message-processor.js', () => ({
  batchMessageProcessor: mockBatchProcessor,
}));

// Import after mocks are set up
let app: Express;

describe('Admin Routes', () => {
  beforeEach(async () => {
    resetPrismaMocks();
    mockBatchProcessor.processBatch.mockReset();

    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Import and register routes (need to re-import to get mocked dependencies)
    const { registerAdminStreamRoutes } = await import(
      '../server/stream/routes/admin-routes.js'
    );

    // Mock admin auth middleware
    const mockAdminAuth = (req: any, res: any, next: any) => next();

    registerAdminStreamRoutes(app, mockAdminAuth);
  });

  describe('GET /api/admin/stream/stats', () => {
    it('should return processing statistics', async () => {
      mockPrismaClient.unifiedMessage.count.mockResolvedValue(1000);
      mockPrismaClient.unifiedMessage.groupBy.mockResolvedValue([
        { processingStatus: 'COMPLETED', _count: 800 },
        { processingStatus: 'PENDING', _count: 150 },
        { processingStatus: 'FAILED', _count: 50 },
      ]);
      mockPrismaClient.messageClassification.count.mockResolvedValue(500);
      mockPrismaClient.docProposal.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(30) // approved
        .mockResolvedValueOnce(60); // pending

      mockPrismaClient.processingWatermark.findUnique.mockResolvedValue(
        createMockWatermark()
      );

      const response = await request(app).get('/api/admin/stream/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        total_messages: 1000,
        processed: 800,
        queued: 150,
        failed: 50,
        with_suggestions: 500,
        proposals: {
          total: 100,
          approved: 30,
          pending: 60,
        },
        processing_watermark: expect.any(String),
        last_batch_processed: expect.any(String),
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaClient.unifiedMessage.count.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/admin/stream/stats');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch stats' });
    });
  });

  describe('GET /api/admin/stream/messages', () => {
    it('should return paginated messages with analysis', async () => {
      const messages = [
        {
          ...createMockMessage({ id: 1 }),
          classification: createMockClassification({ messageId: 1 }),
          docProposal: createMockProposal({ messageId: 1 }),
        },
        {
          ...createMockMessage({ id: 2 }),
          classification: createMockClassification({ messageId: 2 }),
          docProposal: null,
        },
      ];

      mockPrismaClient.unifiedMessage.count.mockResolvedValue(50);
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue(messages);

      const response = await request(app)
        .get('/api/admin/stream/messages')
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 50,
        totalPages: 3,
      });
    });

    it('should filter by docValue', async () => {
      mockPrismaClient.unifiedMessage.count.mockResolvedValue(10);
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/admin/stream/messages')
        .query({ docValue: 'true' });

      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            docProposal: { isNot: null },
          }),
        })
      );
    });

    it('should filter by approved status', async () => {
      mockPrismaClient.unifiedMessage.count.mockResolvedValue(10);
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/admin/stream/messages')
        .query({ approved: 'true' });

      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            docProposal: expect.objectContaining({
              adminApproved: true,
            }),
          }),
        })
      );
    });

    it('should filter by batchId', async () => {
      mockPrismaClient.unifiedMessage.count.mockResolvedValue(10);
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/admin/stream/messages')
        .query({ batchId: 'batch_123' });

      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classification: {
              is: expect.objectContaining({
                batchId: 'batch_123',
              }),
            },
          }),
        })
      );
    });
  });

  describe('GET /api/admin/stream/messages/:id', () => {
    it('should return detailed message info', async () => {
      const message = {
        ...createMockMessage({ id: 1 }),
        classification: createMockClassification(),
        ragContext: { id: 1, retrievedDocs: [], totalTokens: 500 },
        docProposal: createMockProposal(),
      };

      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(message);

      const response = await request(app).get('/api/admin/stream/messages/1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 1,
        classification: expect.any(Object),
        ragContext: expect.any(Object),
        docProposal: expect.any(Object),
      });
    });

    it('should return 404 if message not found', async () => {
      mockPrismaClient.unifiedMessage.findUnique.mockResolvedValue(null);

      const response = await request(app).get('/api/admin/stream/messages/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Message not found' });
    });
  });

  describe('POST /api/admin/stream/process-batch', () => {
    it('should trigger batch processing', async () => {
      mockBatchProcessor.processBatch.mockResolvedValue(42);

      const response = await request(app).post('/api/admin/stream/process-batch');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Batch processing complete',
        messagesProcessed: 42,
      });
      expect(mockBatchProcessor.processBatch).toHaveBeenCalledTimes(1);
    });

    it('should handle processing errors', async () => {
      mockBatchProcessor.processBatch.mockRejectedValue(
        new Error('Processing failed')
      );

      const response = await request(app).post('/api/admin/stream/process-batch');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to process batch' });
    });
  });

  describe('GET /api/admin/stream/proposals', () => {
    it('should return paginated proposals', async () => {
      const proposals = [
        {
          ...createMockProposal({ id: 1 }),
          message: {
            author: 'user1',
            timestamp: new Date(),
            content: 'Test message',
            channel: 'test',
            classification: createMockClassification(),
          },
        },
      ];

      mockPrismaClient.docProposal.findMany.mockResolvedValue(proposals);
      mockPrismaClient.docProposal.count.mockResolvedValue(50);

      const response = await request(app)
        .get('/api/admin/stream/proposals')
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(50);
    });
  });

  describe('POST /api/admin/stream/proposals/:id/approve', () => {
    it('should approve a proposal', async () => {
      const updatedProposal = createMockProposal({
        id: 1,
        adminApproved: true,
        adminReviewedBy: 'admin@example.com',
      });

      mockPrismaClient.docProposal.update.mockResolvedValue(updatedProposal);

      const response = await request(app)
        .post('/api/admin/stream/proposals/1/approve')
        .send({
          approved: true,
          reviewedBy: 'admin@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Proposal approved successfully');
      expect(mockPrismaClient.docProposal.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          adminApproved: true,
          adminReviewedAt: expect.any(Date),
          adminReviewedBy: 'admin@example.com',
        },
      });
    });

    it('should reject a proposal', async () => {
      const updatedProposal = createMockProposal({
        id: 1,
        adminApproved: false,
        adminReviewedBy: 'admin@example.com',
      });

      mockPrismaClient.docProposal.update.mockResolvedValue(updatedProposal);

      const response = await request(app)
        .post('/api/admin/stream/proposals/1/approve')
        .send({
          approved: false,
          reviewedBy: 'admin@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Proposal rejected successfully');
    });

    it('should validate request body', async () => {
      const response = await request(app)
        .post('/api/admin/stream/proposals/1/approve')
        .send({
          // Missing required fields
        });

      expect(response.status).toBe(500); // Zod validation error
    });
  });

  describe('GET /api/admin/stream/batches', () => {
    it('should return list of batches with counts', async () => {
      mockPrismaClient.messageClassification.groupBy
        .mockResolvedValueOnce([
          { batchId: 'batch_1', _count: { messageId: 15 } },
          { batchId: 'batch_2', _count: { messageId: 20 } },
        ])
        .mockResolvedValueOnce([
          { batchId: 'batch_1' },
          { batchId: 'batch_2' },
          { batchId: 'batch_3' },
        ]);

      const response = await request(app)
        .get('/api/admin/stream/batches')
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        batch_id: 'batch_1',
        message_count: 15,
      });
      expect(response.body.pagination.total).toBe(3);
    });
  });

  describe('POST /api/admin/stream/clear-processed', () => {
    it('should clear processed messages and reset status', async () => {
      const messages = [{ id: 1 }, { id: 2 }, { id: 3 }];

      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue(messages);
      mockPrismaClient.$transaction.mockImplementation(async (callback) => {
        return callback({
          docProposal: {
            deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          messageRagContext: {
            deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          },
          messageClassification: {
            deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          },
          unifiedMessage: {
            updateMany: vi.fn().mockResolvedValue({ count: 3 }),
          },
        });
      });

      const response = await request(app).post(
        '/api/admin/stream/clear-processed'
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Processed messages and analysis results cleared successfully',
        count: 3,
      });
    });

    it('should filter by streamId', async () => {
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      await request(app)
        .post('/api/admin/stream/clear-processed')
        .send({ streamId: 'test-stream' });

      expect(mockPrismaClient.unifiedMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            streamId: 'test-stream',
          }),
        })
      );
    });

    it('should return 0 if no messages to clear', async () => {
      mockPrismaClient.unifiedMessage.findMany.mockResolvedValue([]);

      const response = await request(app).post(
        '/api/admin/stream/clear-processed'
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'No processed messages to clear',
        count: 0,
      });
    });
  });

  describe('GET /api/admin/stream/streams', () => {
    it('should return all configured streams', async () => {
      const streams = [
        {
          id: 1,
          streamId: 'csv-stream',
          adapterType: 'csv',
          config: {},
          enabled: true,
          watermarks: [],
          _count: { messages: 100 },
        },
      ];

      mockPrismaClient.streamConfig.findMany.mockResolvedValue(streams);

      const response = await request(app).get('/api/admin/stream/streams');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        streamId: 'csv-stream',
        adapterType: 'csv',
      });
    });
  });
});
