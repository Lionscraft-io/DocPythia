/**
 * Integration Test for Batch Message Processor
 * Tests the complete flow: classification → grouping → RAG → changeset proposals
 * Updated for multi-instance support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BatchMessageProcessor } from '../server/stream/processors/batch-message-processor';
import { PrismaClient } from '@prisma/client';
import { getInstanceDb } from '../server/db/instance-db';

const TEST_INSTANCE = 'near'; // Test with NEAR instance

// Mock dependencies
vi.mock('../server/stream/message-vector-search', () => ({
  MessageVectorSearch: vi.fn().mockImplementation(() => ({
    searchSimilarDocs: vi.fn().mockResolvedValue([
      {
        id: 1,
        title: 'RPC Configuration',
        file_path: 'docs/rpc-config.md',
        content: 'RPC timeout configuration guide...',
        distance: 0.85,
      },
      {
        id: 2,
        title: 'Troubleshooting',
        file_path: 'docs/troubleshooting.md',
        content: 'Common RPC errors and solutions...',
        distance: 0.78,
      },
    ]),
  })),
}));

vi.mock('../server/stream/llm/llm-service', () => ({
  llmService: {
    requestJSON: vi.fn(),
  },
}));

import { llmService } from '../server/stream/llm/llm-service';

describe('Batch Processor Integration', () => {
  let processor: BatchMessageProcessor;
  let db: PrismaClient;

  beforeEach(async () => {
    db = getInstanceDb(TEST_INSTANCE);
    processor = new BatchMessageProcessor(TEST_INSTANCE, db);

    // Clean up test data
    await db.$executeRaw`DELETE FROM doc_proposals WHERE batch_id LIKE 'test_%'`;
    await db.$executeRaw`DELETE FROM conversation_rag_context WHERE batch_id LIKE 'test_%'`;
    await db.$executeRaw`DELETE FROM message_classification WHERE batch_id LIKE 'test_%'`;
    await db.$executeRaw`DELETE FROM unified_messages WHERE stream_id = 'test-stream'`;
    await db.$executeRaw`DELETE FROM stream_configs WHERE stream_id = 'test-stream'`;

    // Create test stream config
    await db.streamConfig.create({
      data: {
        streamId: 'test-stream',
        adapterType: 'test',
        config: {},
        enabled: true,
      },
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test data
    await db.$executeRaw`DELETE FROM doc_proposals WHERE batch_id LIKE 'test_%'`;
    await db.$executeRaw`DELETE FROM conversation_rag_context WHERE batch_id LIKE 'test_%'`;
    await db.$executeRaw`DELETE FROM message_classification WHERE batch_id LIKE 'test_%'`;
    await db.$executeRaw`DELETE FROM unified_messages WHERE stream_id = 'test-stream'`;
    await db.$executeRaw`DELETE FROM stream_configs WHERE stream_id = 'test-stream'`;
  });

  describe('Full Batch Processing Flow', () => {
    it('should process batch and generate conversation-based changesets', async () => {
      // Setup: Create test messages
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const messages = await Promise.all([
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-1',
            timestamp: baseTime,
            author: 'user1',
            content: 'I keep getting RPC timeout errors when calling the API',
            channel: 'help',
            rawData: {},
          },
        }),
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-2',
            timestamp: new Date(baseTime.getTime() + 5 * 60 * 1000),
            author: 'user2',
            content: 'What timeout are you using?',
            channel: 'help',
            rawData: {},
          },
        }),
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-3',
            timestamp: new Date(baseTime.getTime() + 10 * 60 * 1000),
            author: 'user1',
            content: 'Using default 30 seconds. Should I increase it?',
            channel: 'help',
            rawData: {},
          },
        }),
      ]);

      // Mock LLM classification response
      (llmService.requestJSON as any).mockResolvedValueOnce({
        data: {
          valuableMessages: [
            {
              messageId: messages[0].id,
              category: 'troubleshooting',
              docValueReason: 'User experiencing RPC timeout issues',
              suggestedDocPage: 'docs/rpc-config.md',
              ragSearchCriteria: {
                keywords: ['rpc', 'timeout', 'configuration'],
                semanticQuery: 'RPC timeout configuration and troubleshooting',
              },
            },
            {
              messageId: messages[1].id,
              category: 'question',
              docValueReason: 'Question about timeout settings',
              suggestedDocPage: 'docs/rpc-config.md',
              ragSearchCriteria: {
                keywords: ['timeout', 'configuration'],
                semanticQuery: 'RPC timeout settings',
              },
            },
            {
              messageId: messages[2].id,
              category: 'troubleshooting',
              docValueReason: 'Seeking advice on timeout configuration',
              suggestedDocPage: 'docs/rpc-config.md',
              ragSearchCriteria: {
                keywords: ['timeout', 'default', 'configuration'],
                semanticQuery: 'Default RPC timeout configuration',
              },
            },
          ],
          batchSummary: '3 messages about RPC timeout configuration',
        },
        response: {
          modelUsed: 'gemini-2.0-flash-exp',
          content: '{}',
        },
      });

      // Mock LLM proposal generation response
      (llmService.requestJSON as any).mockResolvedValueOnce({
        data: {
          proposals: [
            {
              updateType: 'UPDATE',
              page: 'docs/rpc-config.md',
              section: 'Timeout Configuration',
              location: {
                sectionName: 'Default Timeout Settings',
              },
              suggestedText: `## Default Timeout Settings

The default RPC timeout is 30 seconds. For most use cases, this is sufficient. However, if you're experiencing timeout errors:

1. Consider increasing the timeout for complex queries
2. Check your network latency
3. Monitor RPC node performance

To configure a custom timeout:
\`\`\`javascript
const provider = new JsonRpcProvider({
  url: 'https://rpc.mainnet.near.org',
  timeout: 60000 // 60 seconds
});
\`\`\``,
              reasoning: 'Users are confused about default timeout and how to configure it. This conversation shows common questions about timeout errors.',
              sourceMessages: [messages[0].id, messages[1].id, messages[2].id],
            },
          ],
        },
        response: {
          modelUsed: 'gemini-1.5-pro',
          content: '{}',
        },
      });

      // Process the batch
      const batchStart = new Date(baseTime.getTime() - 60 * 60 * 1000); // 1 hour before
      const batchEnd = new Date(baseTime.getTime() + 60 * 60 * 1000); // 1 hour after

      // Manually call the core processing logic
      const contextMessages = await prisma.unifiedMessage.findMany({
        where: {
          timestamp: {
            gte: batchStart,
            lt: new Date(baseTime),
          },
        },
      });

      const processingMessages = await prisma.unifiedMessage.findMany({
        where: {
          timestamp: {
            gte: new Date(baseTime),
            lt: batchEnd,
          },
        },
      });

      const batchId = 'test_batch_1';

      // Call private method through type assertion
      const classification = await (processor as any).classifyBatch(
        processingMessages,
        contextMessages,
        batchId
      );

      // Group into conversations
      const conversations = await (processor as any).groupIntoConversations(
        classification.valuableMessages,
        processingMessages,
        contextMessages
      );

      // Store classification with conversation IDs
      await (processor as any).storeClassificationResults(
        classification,
        batchId,
        conversations
      );

      // Process conversations
      for (const conversation of conversations) {
        await (processor as any).processConversation(conversation, batchId);
      }

      // Verify results
      const classifications = await prisma.messageClassification.findMany({
        where: { batchId },
      });
      expect(classifications).toHaveLength(3);
      expect(classifications[0].conversationId).toBeTruthy();
      expect(classifications.every(c => c.conversationId === classifications[0].conversationId)).toBe(true);

      const ragContexts = await prisma.conversationRagContext.findMany({
        where: { batchId },
      });
      expect(ragContexts).toHaveLength(1);

      const proposals = await prisma.docProposal.findMany({
        where: { batchId },
      });
      expect(proposals).toHaveLength(1);
      expect(proposals[0].updateType).toBe('UPDATE');
      expect(proposals[0].page).toBe('docs/rpc-config.md');
      expect(proposals[0].sourceMessages).toEqual([messages[0].id, messages[1].id, messages[2].id]);

      // Verify RAG was called once per conversation
      expect(messageVectorSearch.searchSimilarDocs).toHaveBeenCalledTimes(1);

      // Verify LLM was called twice (classification + proposal)
      expect(llmService.requestJSON).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple conversations in same batch', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      // Create two separate conversations
      const messages = await Promise.all([
        // Conversation 1: RPC errors in #help
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-1',
            timestamp: baseTime,
            author: 'user1',
            content: 'RPC timeout error',
            channel: 'help',
            rawData: {},
          },
        }),
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-2',
            timestamp: new Date(baseTime.getTime() + 2 * 60 * 1000),
            author: 'user2',
            content: 'Try increasing timeout',
            channel: 'help',
            rawData: {},
          },
        }),
        // Conversation 2: Staking in #general (different channel)
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-3',
            timestamp: new Date(baseTime.getTime() + 5 * 60 * 1000),
            author: 'user3',
            content: 'How do I stake tokens?',
            channel: 'general',
            rawData: {},
          },
        }),
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-4',
            timestamp: new Date(baseTime.getTime() + 8 * 60 * 1000),
            author: 'user4',
            content: 'Use near-cli stake command',
            channel: 'general',
            rawData: {},
          },
        }),
      ]);

      // Mock LLM responses
      (llmService.requestJSON as any).mockResolvedValueOnce({
        data: {
          valuableMessages: messages.map((msg, idx) => ({
            messageId: msg.id,
            category: idx < 2 ? 'troubleshooting' : 'tutorial',
            docValueReason: idx < 2 ? 'RPC issue' : 'Staking guide',
            ragSearchCriteria: {},
          })),
          batchSummary: '4 messages',
        },
        response: { modelUsed: 'test', content: '{}' },
      });

      // Mock two separate proposal calls (one per conversation)
      (llmService.requestJSON as any)
        .mockResolvedValueOnce({
          data: {
            proposals: [{
              updateType: 'UPDATE',
              page: 'docs/rpc.md',
              reasoning: 'RPC timeout guidance',
              sourceMessages: [messages[0].id, messages[1].id],
            }],
          },
          response: { modelUsed: 'test', content: '{}' },
        })
        .mockResolvedValueOnce({
          data: {
            proposals: [{
              updateType: 'INSERT',
              page: 'docs/staking.md',
              reasoning: 'Staking CLI command',
              sourceMessages: [messages[2].id, messages[3].id],
            }],
          },
          response: { modelUsed: 'test', content: '{}' },
        });

      // Process batch manually
      const processingMessages = await prisma.unifiedMessage.findMany({
        where: { streamId: 'test-stream' },
      });

      const batchId = 'test_batch_2';
      const classification = await (processor as any).classifyBatch(processingMessages, [], batchId);
      const conversations = await (processor as any).groupIntoConversations(
        classification.valuableMessages,
        processingMessages,
        []
      );

      await (processor as any).storeClassificationResults(classification, batchId, conversations);

      for (const conversation of conversations) {
        await (processor as any).processConversation(conversation, batchId);
      }

      // Verify: Should create 2 conversations
      expect(conversations).toHaveLength(2);

      // Verify: RAG called twice (once per conversation)
      expect(messageVectorSearch.searchSimilarDocs).toHaveBeenCalledTimes(2);

      // Verify: 2 proposals created (one per conversation)
      const proposals = await prisma.docProposal.findMany({
        where: { batchId },
      });
      expect(proposals).toHaveLength(2);
    });

    it('should handle empty proposal response (LLM finds no changes needed)', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z');

      const messages = await Promise.all([
        prisma.unifiedMessage.create({
          data: {
            streamId: 'test-stream',
            messageId: 'msg-1',
            timestamp: baseTime,
            author: 'user1',
            content: 'The docs are great!',
            channel: 'feedback',
            rawData: {},
          },
        }),
      ]);

      // Mock classification
      (llmService.requestJSON as any).mockResolvedValueOnce({
        data: {
          valuableMessages: [{
            messageId: messages[0].id,
            category: 'feedback',
            docValueReason: 'Positive feedback',
            ragSearchCriteria: {},
          }],
          batchSummary: '1 message',
        },
        response: { modelUsed: 'test', content: '{}' },
      });

      // Mock empty proposal response
      (llmService.requestJSON as any).mockResolvedValueOnce({
        data: {
          proposals: [], // No changes needed
        },
        response: { modelUsed: 'test', content: '{}' },
      });

      const processingMessages = await prisma.unifiedMessage.findMany({
        where: { streamId: 'test-stream' },
      });

      const batchId = 'test_batch_3';
      const classification = await (processor as any).classifyBatch(processingMessages, [], batchId);
      const conversations = await (processor as any).groupIntoConversations(
        classification.valuableMessages,
        processingMessages,
        []
      );

      await (processor as any).storeClassificationResults(classification, batchId, conversations);

      for (const conversation of conversations) {
        await (processor as any).processConversation(conversation, batchId);
      }

      // Verify: No proposals created
      const proposals = await prisma.docProposal.findMany({
        where: { batchId },
      });
      expect(proposals).toHaveLength(0);
    });
  });
});
