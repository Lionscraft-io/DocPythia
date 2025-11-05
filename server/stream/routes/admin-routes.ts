/**
 * Multi-Stream Scanner Admin Routes
 * API endpoints for admin dashboard and batch processing management
 * Author: Wayne
 * Date: 2025-10-31
 * Updated for batch processing architecture (Phase 1)
 * Reference: /docs/specs/multi-stream-scanner-phase-1.md
 */

import type { Express, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { batchMessageProcessor, BatchMessageProcessor } from '../processors/batch-message-processor.js';
import pg from 'pg';
const { Pool } = pg;

const prisma = new PrismaClient();

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const filterSchema = z.object({
  docValue: z.enum(['true', 'false', 'all']).optional(),
  approved: z.enum(['true', 'false', 'all']).optional(),
  streamId: z.string().optional(),
  category: z.string().optional(),
  batchId: z.string().optional(),
  processingStatus: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'all']).optional(),
});

const processRequestSchema = z.object({
  streamId: z.string(),
  batchSize: z.number().int().min(1).max(50).optional(),
});

const approveProposalSchema = z.object({
  proposalId: z.number().int(),
  approved: z.boolean(),
  reviewedBy: z.string(),
});

/**
 * Register multi-stream scanner admin routes
 */
export function registerAdminStreamRoutes(app: Express, adminAuth: any) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  /**
   * GET /api/admin/stream/stats
   * Get processing statistics
   */
  app.get('/api/admin/stream/stats', adminAuth, async (req: Request, res: Response) => {
    try {
      // Get total messages
      const totalMessages = await prisma.unifiedMessage.count();

      // Get messages by processing status
      const statusCounts = await prisma.unifiedMessage.groupBy({
        by: ['processingStatus'],
        _count: true,
      });

      const processed = statusCounts.find(s => s.processingStatus === 'COMPLETED')?._count || 0;
      const queued = statusCounts.find(s => s.processingStatus === 'PENDING')?._count || 0;
      const failed = statusCounts.find(s => s.processingStatus === 'FAILED')?._count || 0;

      // Get messages with doc value
      const withDocValue = await prisma.messageClassification.count();

      // Get proposals (total and by approval status)
      const totalProposals = await prisma.docProposal.count();
      const approvedProposals = await prisma.docProposal.count({
        where: { adminApproved: true },
      });
      const pendingProposals = await prisma.docProposal.count({
        where: { adminApproved: false, adminReviewedAt: null },
      });

      // Get processing watermark info
      const watermark = await prisma.processingWatermark.findUnique({
        where: { id: 1 },
      });

      res.json({
        total_messages: totalMessages,
        processed,
        queued,
        failed,
        with_suggestions: withDocValue,
        proposals: {
          total: totalProposals,
          approved: approvedProposals,
          pending: pendingProposals,
        },
        processing_watermark: watermark?.watermarkTime || null,
        last_batch_processed: watermark?.lastProcessedBatch || null,
        is_processing: BatchMessageProcessor.getProcessingStatus(),
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  /**
   * GET /api/admin/stream/messages
   * List all messages with analysis results
   */
  app.get('/api/admin/stream/messages', adminAuth, async (req: Request, res: Response) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const filters = filterSchema.parse(req.query);

      const offset = (page - 1) * limit;

      // Build Prisma where clause
      const where: any = {};

      // If processingStatus filter is provided, use it
      if (filters.processingStatus && filters.processingStatus !== 'all') {
        where.processingStatus = filters.processingStatus;
      }

      // Handle classification-based filters (category, batchId)
      const needsClassification = filters.category || filters.batchId;

      if (needsClassification || filters.processingStatus !== 'PENDING') {
        where.classification = {
          is: {}, // Only show messages with classification
        };

        if (filters.category) {
          where.classification.is.category = filters.category;
        }

        if (filters.batchId) {
          where.classification.is.batchId = filters.batchId;
        }
      }

      // Note: docProposal filtering removed - proposals are now conversation-based, not message-based
      // To filter by proposals, query the doc_proposals table by conversation_id instead

      if (filters.streamId) {
        where.streamId = filters.streamId;
      }

      // Get total count
      const total = await prisma.unifiedMessage.count({ where });

      // Get paginated results with full data
      const messages = await prisma.unifiedMessage.findMany({
        where,
        include: {
          classification: true,
          // docProposal removed - proposals are conversation-based now
        },
        orderBy: {
          timestamp: 'desc',
        },
        skip: offset,
        take: limit,
      });

      // Transform to match expected format
      const data = messages.map(msg => ({
        id: msg.id,
        stream_id: msg.streamId,
        author: msg.author,
        channel: msg.channel,
        content: msg.content,
        timestamp: msg.timestamp,
        created_at: msg.timestamp,
        processing_status: msg.processingStatus,
        category: msg.classification?.category || null,
        doc_value_reason: msg.classification?.docValueReason || null,
        suggested_doc_page: msg.classification?.suggestedDocPage || null,
        batch_id: msg.classification?.batchId || null,
        conversation_id: msg.classification?.conversationId || null,
        // Note: proposal info removed - proposals are conversation-based, not message-based
        page: null,
        update_type: null,
        section: null,
        suggested_text: null,
        confidence: null,
        admin_approved: false,
        admin_reviewed_at: null,
        admin_reviewed_by: null,
      }));

      res.json({
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  /**
   * GET /api/admin/stream/messages/:id
   * Get detailed information about a single message
   */
  app.get('/api/admin/stream/messages/:id', adminAuth, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.id);

      const message = await prisma.unifiedMessage.findUnique({
        where: { id: messageId },
        include: {
          classification: true,
          ragContext: true,
          docProposal: true,
        },
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      res.json(message);
    } catch (error) {
      console.error('Error fetching message:', error);
      res.status(500).json({ error: 'Failed to fetch message' });
    }
  });

  /**
   * POST /api/admin/stream/process
   * Manually trigger stream import (fetch messages without processing)
   */
  app.post('/api/admin/stream/process', adminAuth, async (req: Request, res: Response) => {
    try {
      const { streamId, batchSize } = processRequestSchema.parse(req.body);

      // Import streamManager here to avoid circular dependency
      const { streamManager } = await import('../stream-manager.js');

      // Fetch messages without processing them
      const imported = await streamManager.importStream(streamId, batchSize);

      res.json({
        message: 'Stream import complete',
        imported,
      });
    } catch (error) {
      console.error('Error importing messages:', error);
      res.status(500).json({ error: 'Failed to import messages' });
    }
  });

  /**
   * POST /api/admin/stream/process-batch
   * Process the next 24-hour batch of messages
   */
  app.post('/api/admin/stream/process-batch', adminAuth, async (req: Request, res: Response) => {
    try {
      console.log('[Admin] Starting batch processing...');
      const messagesProcessed = await batchMessageProcessor.processBatch();

      res.json({
        message: 'Batch processing complete',
        messagesProcessed,
      });
    } catch (error) {
      console.error('Error processing batch:', error);
      res.status(500).json({ error: 'Failed to process batch' });
    }
  });

  /**
   * GET /api/admin/stream/proposals
   * List documentation update proposals
   */
  app.get('/api/admin/stream/proposals', adminAuth, async (req: Request, res: Response) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const offset = (page - 1) * limit;

      const proposals = await prisma.docProposal.findMany({
        include: {
          message: {
            select: {
              author: true,
              timestamp: true,
              content: true,
              channel: true,
              classification: {
                select: {
                  category: true,
                  docValueReason: true,
                  batchId: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: offset,
        take: limit,
      });

      const total = await prisma.docProposal.count();

      res.json({
        data: proposals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error fetching proposals:', error);
      res.status(500).json({ error: 'Failed to fetch proposals' });
    }
  });

  /**
   * POST /api/admin/stream/proposals/:id/approve
   * Approve or reject a documentation proposal
   */
  app.post('/api/admin/stream/proposals/:id/approve', adminAuth, async (req: Request, res: Response) => {
    try {
      const proposalId = parseInt(req.params.id);
      const { approved, reviewedBy } = z.object({
        approved: z.boolean(),
        reviewedBy: z.string(),
      }).parse(req.body);

      const updated = await prisma.docProposal.update({
        where: { id: proposalId },
        data: {
          adminApproved: approved,
          adminReviewedAt: new Date(),
          adminReviewedBy: reviewedBy,
        },
      });

      res.json({
        message: `Proposal ${approved ? 'approved' : 'rejected'} successfully`,
        proposal: updated,
      });
    } catch (error) {
      console.error('Error approving proposal:', error);
      res.status(500).json({ error: 'Failed to approve proposal' });
    }
  });

  /**
   * PATCH /api/admin/stream/proposals/:id
   * Update proposal text
   */
  app.patch('/api/admin/stream/proposals/:id', adminAuth, async (req: Request, res: Response) => {
    try {
      const proposalId = parseInt(req.params.id);
      const { suggestedText, editedBy } = z.object({
        suggestedText: z.string().max(10000),
        editedBy: z.string(),
      }).parse(req.body);

      const updated = await prisma.docProposal.update({
        where: { id: proposalId },
        data: {
          editedText: suggestedText,
          editedAt: new Date(),
          editedBy: editedBy,
        },
      });

      res.json({
        message: 'Proposal text updated successfully',
        proposal: updated,
      });
    } catch (error) {
      console.error('Error updating proposal:', error);
      res.status(500).json({ error: 'Failed to update proposal' });
    }
  });

  /**
   * POST /api/admin/stream/proposals/:id/status
   * Change proposal status (approve/ignore/reset)
   */
  app.post('/api/admin/stream/proposals/:id/status', adminAuth, async (req: Request, res: Response) => {
    try {
      const proposalId = parseInt(req.params.id);
      const { status, reviewedBy } = z.object({
        status: z.enum(['approved', 'ignored', 'pending']),
        reviewedBy: z.string(),
      }).parse(req.body);

      // Update the proposal
      const updated = await prisma.docProposal.update({
        where: { id: proposalId },
        data: {
          status: status as any,
          adminApproved: status === 'approved',
          adminReviewedAt: status !== 'pending' ? new Date() : null,
          adminReviewedBy: status !== 'pending' ? reviewedBy : null,
          discardReason: status === 'ignored' ? 'Admin discarded change' : null,
        },
      });

      // Calculate conversation status
      const allProposals = await prisma.docProposal.findMany({
        where: { conversationId: updated.conversationId },
        select: { status: true },
      });

      const hasPending = allProposals.some(p => p.status === 'pending');
      let conversationStatus: 'pending' | 'changeset' | 'discarded';

      if (hasPending) {
        conversationStatus = 'pending';
      } else {
        const hasApproved = allProposals.some(p => p.status === 'approved');
        conversationStatus = hasApproved ? 'changeset' : 'discarded';
      }

      res.json({
        message: `Proposal status changed to ${status} successfully`,
        proposal: updated,
        conversationStatus,
      });
    } catch (error) {
      console.error('Error changing proposal status:', error);
      res.status(500).json({ error: 'Failed to change proposal status' });
    }
  });

  /**
   * GET /api/admin/stream/batches
   * List processed batches
   */
  app.get('/api/admin/stream/batches', adminAuth, async (req: Request, res: Response) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const offset = (page - 1) * limit;

      // Get unique batch IDs with counts
      const batches = await prisma.messageClassification.groupBy({
        by: ['batchId'],
        _count: {
          messageId: true,
        },
        orderBy: {
          batchId: 'desc',
        },
        skip: offset,
        take: limit,
      });

      const total = await prisma.messageClassification.groupBy({
        by: ['batchId'],
      });

      res.json({
        data: batches.map(b => ({
          batch_id: b.batchId,
          message_count: b._count.messageId,
        })),
        pagination: {
          page,
          limit,
          total: total.length,
          totalPages: Math.ceil(total.length / limit),
        },
      });
    } catch (error) {
      console.error('Error fetching batches:', error);
      res.status(500).json({ error: 'Failed to fetch batches' });
    }
  });

  /**
   * GET /api/admin/stream/streams
   * List all configured streams
   */
  app.get('/api/admin/stream/streams', adminAuth, async (req: Request, res: Response) => {
    try {
      const streams = await prisma.streamConfig.findMany({
        include: {
          watermarks: true,
          _count: {
            select: {
              messages: true,
            },
          },
        },
      });

      res.json(streams);
    } catch (error) {
      console.error('Error fetching streams:', error);
      res.status(500).json({ error: 'Failed to fetch streams' });
    }
  });

  /**
   * POST /api/admin/stream/register
   * Register a new stream or update existing stream configuration
   */
  app.post('/api/admin/stream/register', adminAuth, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        streamId: z.string().min(1),
        adapterType: z.enum(['telegram-bot', 'csv', 'zulipchat']),
        config: z.record(z.any()),
        enabled: z.boolean().optional().default(true),
      });

      const data = schema.parse(req.body);

      // Check if stream already exists
      const existing = await prisma.streamConfig.findUnique({
        where: { streamId: data.streamId },
      });

      let stream;
      if (existing) {
        // Update existing stream
        stream = await prisma.streamConfig.update({
          where: { streamId: data.streamId },
          data: {
            adapterType: data.adapterType,
            config: data.config as any,
            enabled: data.enabled,
          },
        });
        console.log(`Updated stream config for ${data.streamId}`);
      } else {
        // Create new stream
        stream = await prisma.streamConfig.create({
          data: {
            streamId: data.streamId,
            adapterType: data.adapterType,
            config: data.config as any,
            enabled: data.enabled,
          },
        });
        console.log(`Created stream config for ${data.streamId}`);
      }

      // Import and reinitialize stream manager to pick up new config
      const { streamManager } = await import('../stream-manager.js');
      await streamManager.initialize();

      res.json({
        success: true,
        message: existing ? 'Stream updated successfully' : 'Stream registered successfully',
        stream,
      });
    } catch (error: any) {
      console.error('Error registering stream:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid request data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to register stream', details: error.message });
      }
    }
  });

  /**
   * POST /api/admin/stream/clear-processed
   * Reset processed messages back to PENDING status and delete all analysis results for re-testing
   */
  app.post('/api/admin/stream/clear-processed', adminAuth, async (req: Request, res: Response) => {
    try {
      const bodyValidation = z.object({
        streamId: z.string().optional(),
      }).safeParse(req.body);

      const streamId = bodyValidation.success ? bodyValidation.data.streamId : undefined;

      // Get all COMPLETED messages (includes both classified and orphaned messages)
      const messagesToClear = await prisma.unifiedMessage.findMany({
        where: {
          ...(streamId ? { streamId } : {}),
          processingStatus: 'COMPLETED',
        },
        select: { id: true },
      });

      const messageIds = messagesToClear.map(m => m.id);
      console.log(`Found ${messageIds.length} messages to clear`);

      if (messageIds.length === 0) {
        return res.json({
          message: 'No processed messages to clear',
          count: 0,
        });
      }

      // Delete all related records in a transaction
      await prisma.$transaction(async (tx) => {
        // Get all conversation IDs associated with these messages
        const conversationIds = await tx.messageClassification.findMany({
          where: {
            messageId: { in: messageIds },
            conversationId: { not: null },
          },
          select: { conversationId: true },
          distinct: ['conversationId'],
        });
        const conversationIdList = conversationIds
          .map(c => c.conversationId)
          .filter((id): id is string => id !== null);

        console.log(`  └─ Found ${conversationIdList.length} unique conversations`);

        // Delete proposals by conversationId
        const proposalsDeleted = await tx.docProposal.deleteMany({
          where: {
            conversationId: { in: conversationIdList },
          },
        });
        console.log(`  └─ Deleted ${proposalsDeleted.count} proposals`);

        // Delete conversation RAG context
        const ragDeleted = await tx.conversationRagContext.deleteMany({
          where: {
            conversationId: { in: conversationIdList },
          },
        });
        console.log(`  └─ Deleted ${ragDeleted.count} conversation RAG contexts`);

        // Delete classifications
        const classificationsDeleted = await tx.messageClassification.deleteMany({
          where: {
            messageId: { in: messageIds },
          },
        });
        console.log(`  └─ Deleted ${classificationsDeleted.count} classifications`);

        // Reset messages back to PENDING
        const messagesUpdated = await tx.unifiedMessage.updateMany({
          where: { id: { in: messageIds } },
          data: {
            processingStatus: 'PENDING',
            failureCount: 0,
            lastError: null,
          },
        });
        console.log(`  └─ Reset ${messagesUpdated.count} messages to PENDING`);

        // Reset processing watermark to allow reprocessing from the beginning
        // Find the earliest message timestamp
        const earliestMessage = await tx.unifiedMessage.findFirst({
          where: streamId ? { streamId } : {},
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true },
        });

        // Set watermark to before the earliest message (or a very early date if no messages)
        const resetWatermark = earliestMessage
          ? new Date(earliestMessage.timestamp.getTime() - 1000) // 1 second before earliest message
          : new Date('2000-01-01T00:00:00Z'); // Very early date if no messages

        await tx.processingWatermark.updateMany({
          data: {
            watermarkTime: resetWatermark,
            lastProcessedBatch: null,
          },
        });
        console.log(`  └─ Reset processing watermark to ${resetWatermark.toISOString()}`);
      });

      res.json({
        message: 'Processed messages and analysis results cleared successfully',
        count: messageIds.length,
      });
    } catch (error) {
      console.error('Error clearing processed messages:', error);
      res.status(500).json({ error: 'Failed to clear processed messages' });
    }
  });

  /**
   * GET /api/admin/stream/conversations
   * List conversations with messages, RAG context, and proposals
   * Conversation-centric view for admin dashboard
   * Query params: page, limit, category, hasProposals, status (pending|changeset|discarded)
   */
  app.get('/api/admin/stream/conversations', adminAuth, async (req: Request, res: Response) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const category = req.query.category as string | undefined;
      const hasProposals = req.query.hasProposals === 'true';
      const statusFilter = req.query.status as 'pending' | 'changeset' | 'discarded' | undefined;
      const offset = (page - 1) * limit;

      console.log(`[Conversations] Query params - category: ${category}, hasProposals: ${req.query.hasProposals}, status: ${statusFilter}`);

      // Build where clause for filtering
      const where: any = {
        conversationId: { not: null }, // Exclude no-doc-value messages (conversationId = null)
      };
      if (category && category !== 'all') {
        where.category = category;
      }

      // Get all unique conversation IDs with message counts
      let allConversations = await prisma.messageClassification.groupBy({
        by: ['conversationId'],
        where,
        _count: {
          messageId: true,
        },
        _min: {
          createdAt: true,
        },
        orderBy: {
          _min: {
            createdAt: 'desc',
          },
        },
      });

      // Filter by status if needed
      if (statusFilter) {
        // Get all proposals grouped by conversation
        const allProposals = await prisma.docProposal.groupBy({
          by: ['conversationId', 'status'],
          _count: true,
        });

        // Build a map of conversationId -> proposal statuses
        const conversationStatusMap = new Map<string, Set<string>>();
        for (const proposal of allProposals) {
          if (!conversationStatusMap.has(proposal.conversationId)) {
            conversationStatusMap.set(proposal.conversationId, new Set());
          }
          conversationStatusMap.get(proposal.conversationId)!.add(proposal.status);
        }

        // Calculate status for each conversation
        // Note: Conversations can appear in multiple tabs if they have mixed statuses
        const conversationsByStatus = {
          pending: new Set<string>(),
          changeset: new Set<string>(),
          discarded: new Set<string>(),
        };

        for (const [conversationId, statuses] of conversationStatusMap.entries()) {
          // Pending: has any pending proposals
          if (statuses.has('pending')) {
            conversationsByStatus.pending.add(conversationId);
          }

          // Changeset: has any approved proposals
          if (statuses.has('approved')) {
            conversationsByStatus.changeset.add(conversationId);
          }

          // Discarded: has any ignored proposals
          if (statuses.has('ignored')) {
            conversationsByStatus.discarded.add(conversationId);
          }
        }

        // For discarded filter, also include conversations with proposalsRejected=true but no proposals
        if (statusFilter === 'discarded') {
          const autoRejectedConversations = await prisma.conversationRagContext.findMany({
            where: {
              proposalsRejected: true,
            },
            select: {
              conversationId: true,
            },
          });

          for (const conv of autoRejectedConversations) {
            conversationsByStatus.discarded.add(conv.conversationId);
          }

          console.log(`[Conversations Filter] Added ${autoRejectedConversations.length} auto-rejected conversations to discarded`);
        }

        console.log(`[Conversations Filter] Status filter: ${statusFilter}, found ${conversationsByStatus[statusFilter].size} conversations`);
        allConversations = allConversations.filter(c =>
          c.conversationId && conversationsByStatus[statusFilter].has(c.conversationId)
        );
      } else if (req.query.hasProposals !== undefined) {
        // Legacy filter - kept for backward compatibility
        const conversationsWithProposals = await prisma.docProposal.findMany({
          select: { conversationId: true },
          distinct: ['conversationId'],
        });
        const idsWithProposals = new Set(conversationsWithProposals.map(p => p.conversationId));

        if (hasProposals) {
          allConversations = allConversations.filter(c => c.conversationId && idsWithProposals.has(c.conversationId));
        } else {
          allConversations = allConversations.filter(c => c.conversationId && !idsWithProposals.has(c.conversationId));
        }
      }

      const total = allConversations.length;
      const conversations = allConversations.slice(offset, offset + limit);

      // For each conversation, fetch detailed data
      const conversationData = await Promise.all(
        conversations.map(async (conv) => {
          if (!conv.conversationId) return null;

          // Get all messages in this conversation (ordered by timestamp)
          const messages = await prisma.messageClassification.findMany({
            where: { conversationId: conv.conversationId },
            include: {
              message: {
                select: {
                  id: true,
                  author: true,
                  channel: true,
                  content: true,
                  timestamp: true,
                  streamId: true,
                  processingStatus: true,
                },
              },
            },
            orderBy: {
              message: {
                timestamp: 'asc',
              },
            },
          });

          // Count processed messages (COMPLETED status)
          const processedCount = messages.filter(m => m.message.processingStatus === 'COMPLETED').length;

          // Get conversation-level category (from first message)
          const category = messages[0]?.category || 'unknown';
          const batchId = messages[0]?.batchId || null;

          // Get RAG context for this conversation
          const ragContext = await prisma.conversationRagContext.findUnique({
            where: { conversationId: conv.conversationId },
          });

          // Get all proposals for this conversation
          const proposals = await prisma.docProposal.findMany({
            where: { conversationId: conv.conversationId },
            orderBy: { createdAt: 'desc' },
          });

          return {
            conversation_id: conv.conversationId,
            category,
            batch_id: batchId,
            message_count: conv._count.messageId,
            processed_count: processedCount,
            created_at: conv._min.createdAt,
            messages: messages.map(m => ({
              id: m.message.id,
              author: m.message.author,
              channel: m.message.channel,
              content: m.message.content,
              timestamp: m.message.timestamp,
              stream_id: m.message.streamId,
              category: m.category,
              doc_value_reason: m.docValueReason,
              rag_search_criteria: m.ragSearchCriteria,
            })),
            rag_context: ragContext ? {
              retrieved_docs: ragContext.retrievedDocs,
              total_tokens: ragContext.totalTokens,
              proposals_rejected: ragContext.proposalsRejected,
              rejection_reason: ragContext.rejectionReason,
            } : null,
            proposals: proposals.map(p => ({
              id: p.id,
              page: p.page,
              update_type: p.updateType,
              section: p.section,
              location: p.location,
              suggested_text: p.suggestedText,
              reasoning: p.reasoning,
              source_messages: p.sourceMessages,
              status: p.status,
              edited_text: p.editedText,
              edited_at: p.editedAt,
              edited_by: p.editedBy,
              admin_approved: p.adminApproved,
              admin_reviewed_at: p.adminReviewedAt,
              admin_reviewed_by: p.adminReviewedBy,
              discard_reason: p.discardReason,
              model_used: p.modelUsed,
              created_at: p.createdAt,
            })),
          };
        })
      );

      // Filter out null values
      const validConversations = conversationData.filter(c => c !== null);

      // Calculate total message counts across ALL messages in system, not just conversations
      const totalMessagesInSystem = await prisma.unifiedMessage.count();
      const totalProcessedMessages = validConversations.reduce((sum, conv) => sum + (conv?.processed_count || 0), 0);

      // Get total message count across FILTERED conversations (not all conversations)
      // Extract all conversation IDs from the filtered list
      const filteredConversationIds = allConversations
        .map(c => c.conversationId)
        .filter((id): id is string => id !== null);

      const totalMessagesInConversations = await prisma.messageClassification.count({
        where: {
          conversationId: { in: filteredConversationIds },
        },
      });

      res.json({
        data: validConversations,
        totals: {
          total_messages: totalMessagesInSystem,
          total_processed: totalProcessedMessages,
          total_messages_in_conversations: totalMessagesInConversations,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  /**
   * POST /api/admin/stream/telegram-webhook
   * Telegram bot webhook endpoint
   * Only used when adapter is in webhook mode
   */
  app.post('/api/admin/stream/telegram-webhook', async (req: Request, res: Response) => {
    try {
      // Import streamManager here to avoid circular dependency
      const { streamManager } = await import('../stream-manager.js');
      const { TelegramBotAdapter } = await import('../adapters/telegram-bot-adapter.js');

      // Find active Telegram bot adapter
      const adapters = Array.from(streamManager.getAdapters().values());
      const telegramAdapter = adapters.find(
        (adapter) => adapter instanceof TelegramBotAdapter
      ) as any;

      if (!telegramAdapter) {
        return res.status(404).json({ error: 'Telegram bot not configured' });
      }

      // Process update through Telegraf
      const bot = telegramAdapter.getBotInstance();
      await bot.handleUpdate(req.body);

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Telegram webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  console.log('Multi-stream scanner admin routes registered');
}
