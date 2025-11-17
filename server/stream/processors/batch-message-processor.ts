/**
 * Batch Message Processor
 *
 * Implements Phase 1 batch processing architecture:
 * - Dual watermark system (import + processing)
 * - 24-hour batch windows with 24-hour context
 * - Batch classification for efficiency
 * - Proposal generation only for valuable messages
 * - Multi-instance aware: Each instance has its own batch processor
 *
 * Author: Wayne
 * Date: 2025-10-31
 * Updated: 2025-11-14 - Multi-instance support
 */

import { PrismaClient } from '@prisma/client';
import { llmService } from '../llm/llm-service.js';
import { MessageVectorSearch } from '../message-vector-search.js';
import { PROMPT_TEMPLATES, fillTemplate } from '../llm/prompt-templates.js';
import { InstanceConfigLoader } from '../../config/instance-loader.js';
import { z } from 'zod';

// ========== Batch Classification Schema ==========

const BatchClassificationResultSchema = z.object({
  threads: z.array(z.object({
    category: z.string().max(50, 'Category must be 50 characters or less'),
    messages: z.array(z.number()).min(1, 'Thread must contain at least one message'),
    summary: z.string().max(200, 'Thread summary must be 200 characters or less'),
    docValueReason: z.string().max(300, 'Documentation value reason must be 300 characters or less'),
    ragSearchCriteria: z.object({
      keywords: z.array(z.string().max(50, 'Keywords must be 50 characters or less')),
      semanticQuery: z.string().max(200, 'Semantic query must be 200 characters or less'),
    }),
  })),
  batchSummary: z.string().max(500, 'Batch summary must be 500 characters or less'),
});

type BatchClassificationResult = z.infer<typeof BatchClassificationResultSchema>;

// ========== Proposal Generation Schema ==========

const ProposalGenerationSchema = z.object({
  updateType: z.enum(['INSERT', 'UPDATE', 'DELETE', 'NONE']),
  page: z.string().max(150, 'Page path must be 150 characters or less'),
  section: z.string().max(100, 'Section name must be 100 characters or less').optional(),
  location: z.object({
    lineStart: z.number().optional(),
    lineEnd: z.number().optional(),
    sectionName: z.string().max(100, 'Section name must be 100 characters or less').optional(),
  }).optional(),
  suggestedText: z.string().max(2000, 'Suggested text must be 2000 characters or less').optional(),
  reasoning: z.string().max(300, 'Reasoning must be 300 characters or less'),
  sourceMessages: z.array(z.number()).optional(), // Message IDs that led to this proposal
});

type ProposalGeneration = z.infer<typeof ProposalGenerationSchema>;

// ========== Conversation Grouping Types ==========

interface ConversationGroup {
  id: string;
  channel: string | null;
  summary: string; // Thread summary from LLM
  messages: Array<{
    messageId: number;
    timestamp: Date;
    author: string;
    content: string;
    category: string;
    docValueReason: string;
    suggestedDocPage?: string;
    ragSearchCriteria?: any;
  }>;
  timeStart: Date;
  timeEnd: Date;
  messageCount: number;
}

// ========== Configuration ==========

interface BatchProcessorConfig {
  batchWindowHours: number;  // 24 hours
  contextWindowHours: number; // 24 hours (previous batch)
  maxBatchSize: number;       // Maximum messages per batch
  classificationModel: string;
  proposalModel: string;
  ragTopK: number;            // Number of docs to retrieve for RAG
  conversationTimeWindowMinutes: number; // Time window for grouping messages into conversations
  maxConversationSize: number; // Maximum messages per conversation
  minConversationGapMinutes: number; // Minimum gap to start new conversation
}

const DEFAULT_CONFIG: BatchProcessorConfig = {
  batchWindowHours: 24,
  contextWindowHours: 24,
  maxBatchSize: 30, // Reduced from 500 to prevent LLM from generating overly long responses
  classificationModel: process.env.LLM_CLASSIFICATION_MODEL || 'gemini-2.0-flash-exp',
  proposalModel: process.env.LLM_PROPOSAL_MODEL || 'gemini-1.5-pro',
  ragTopK: 5,
  conversationTimeWindowMinutes: 15,
  maxConversationSize: 20,
  minConversationGapMinutes: 5,
};

// ========== Batch Message Processor ==========

export class BatchMessageProcessor {
  private config: BatchProcessorConfig;
  private static isProcessing: boolean = false;
  private instanceId: string;
  private db: PrismaClient;
  private messageVectorSearch: MessageVectorSearch;

  constructor(instanceId: string, db: PrismaClient, config: Partial<BatchProcessorConfig> = {}) {
    this.instanceId = instanceId;
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.messageVectorSearch = new MessageVectorSearch(instanceId, db);
    console.log(`[${instanceId}] BatchMessageProcessor initialized`);
  }

  /**
   * Check if batch processing is currently running
   */
  static getProcessingStatus(): boolean {
    return BatchMessageProcessor.isProcessing;
  }

  /**
   * Process the next batch of messages
   * Returns number of messages processed
   */
  async processBatch(): Promise<number> {
    // Check if already processing
    if (BatchMessageProcessor.isProcessing) {
      console.log('[BatchProcessor] Already processing, skipping...');
      return 0;
    }

    // Set processing flag
    BatchMessageProcessor.isProcessing = true;
    console.log('[BatchProcessor] Starting batch processing...');

    try {
      let totalMessagesProcessedAcrossAllBatches = 0;
      let batchNumber = 0;

      // Keep processing batches until no more pending messages
      while (true) {
        batchNumber++;
        console.log(`\n[BatchProcessor] ========== BATCH ${batchNumber} ==========`);

        // 1. Get processing watermark
        const watermark = await this.getProcessingWatermark();
        console.log(`[BatchProcessor] Current watermark: ${watermark.toISOString()}`);

        // 2. Find the earliest unprocessed message after the watermark
        const earliestUnprocessed = await this.db.unifiedMessage.findFirst({
          where: {
            timestamp: { gte: watermark },
            processingStatus: 'PENDING',
          },
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true },
        });

        if (!earliestUnprocessed) {
          console.log(`[BatchProcessor] No more unprocessed messages found. Processed ${batchNumber - 1} batches total.`);
          break;
        }

        console.log(`[BatchProcessor] Found earliest unprocessed message at: ${earliestUnprocessed.timestamp.toISOString()}`);

        // 3. Calculate batch window starting from earliest unprocessed message
        const batchStart = earliestUnprocessed.timestamp;
        const idealBatchEnd = new Date(batchStart.getTime() + this.config.batchWindowHours * 60 * 60 * 1000);
        const now = new Date();

        // Use the earlier of: ideal batch end (24h) or current time
        // This allows processing of messages even if we don't have a full 24h batch yet
        const batchEnd = idealBatchEnd < now ? idealBatchEnd : now;

        console.log(`[BatchProcessor] Batch window: ${batchStart.toISOString()} to ${batchEnd.toISOString()}`);

        // Check if there are any messages in this window
        const messageCount = await this.db.unifiedMessage.count({
          where: {
            timestamp: { gte: batchStart, lt: batchEnd },
            processingStatus: 'PENDING',
          },
        });

        if (messageCount === 0) {
          console.log(`[BatchProcessor] No pending messages in this batch window, moving watermark forward`);
          await this.updateProcessingWatermark(batchEnd);
          continue; // Try next batch
        }

        console.log(`[BatchProcessor] Found ${messageCount} pending messages in batch window`);

        // Use timestamps instead of ISO strings to keep batch_id under 50 chars
        const batchId = `b_${batchStart.getTime()}_${batchEnd.getTime()}`;

        // 4. Fetch context messages (24 hours BEFORE batch start)
        const contextStart = new Date(batchStart.getTime() - this.config.contextWindowHours * 60 * 60 * 1000);
        const contextMessages = await this.fetchContextMessages(contextStart, batchStart);
        console.log(`[BatchProcessor] Fetched ${contextMessages.length} context messages from ${contextStart.toISOString()} to ${batchStart.toISOString()}`);

        // Process messages in chunks until the batch window is exhausted
        let totalMessagesProcessed = 0;
        let totalConversationsProcessed = 0;
        let totalProposalsGenerated = 0;
        let iteration = 0;
        let anyMessagesFailed = false;

    while (true) {
      iteration++;
      console.log(`[BatchProcessor] Iteration ${iteration}: Fetching next chunk...`);

      // 3. Fetch next chunk of messages for batch (up to maxBatchSize)
      const messages = await this.fetchMessagesForBatch(batchStart, batchEnd);
      console.log(`[BatchProcessor] Iteration ${iteration}: Fetched ${messages.length} messages`);

      if (messages.length === 0) {
        // No more messages in this batch window
        break;
      }

      // 5. Perform batch classification (LLM groups messages into threads)
      const classification = await this.classifyBatch(messages, contextMessages, batchId);
      const valuableThreads = classification.threads.filter(t => t.category !== 'no-doc-value');
      const noValueThreads = classification.threads.filter(t => t.category === 'no-doc-value');
      console.log(`[BatchProcessor] Iteration ${iteration}: Classified ${classification.threads.length} threads (${valuableThreads.length} valuable, ${noValueThreads.length} no-value)`);

      // 6. Convert ALL threads to conversation groups (including no-value threads for proper tracking)
      const valuableConversations = await this.convertThreadsToConversations(
        valuableThreads,
        messages,
        batchId
      );
      const noValueConversations = await this.convertThreadsToConversations(
        noValueThreads,
        messages,
        batchId
      );
      const allConversations = [...valuableConversations, ...noValueConversations];
      console.log(`[BatchProcessor] Iteration ${iteration}: Created ${valuableConversations.length} valuable and ${noValueConversations.length} no-value conversation groups`);

      // 7. Store classification results for ALL threads (valuable + no-value)
      await this.storeClassificationResults(classification.threads, batchId, allConversations, messages);

      // 8. Process each conversation (RAG + Changeset Proposals for valuable, mark no-value as discarded)
      // Track successfully processed message IDs
      const successfullyProcessedMessageIds = new Set<number>();
      let iterationProposals = 0;

      for (const conversation of valuableConversations) {
        try {
          const proposalCount = await this.processConversation(conversation, batchId);
          totalConversationsProcessed++;
          iterationProposals += proposalCount;

          // Mark this conversation's messages as successfully processed
          conversation.messages.forEach(msg => successfullyProcessedMessageIds.add(msg.messageId));
        } catch (error) {
          console.error(`[BatchProcessor] Error processing conversation ${conversation.id}:`, error);
          console.error(`[BatchProcessor] Conversation will remain unprocessed and retry on next batch run`);
          // Do NOT mark messages as completed - they will retry
          // Continue processing other conversations
        }
      }

      // 8.5. Create RAG context entries for no-value conversations (mark as auto-discarded)
      for (const conversation of noValueConversations) {
        try {
          await this.processNoValueConversation(conversation, batchId);
          totalConversationsProcessed++;

          // Mark this conversation's messages as successfully processed
          conversation.messages.forEach(msg => successfullyProcessedMessageIds.add(msg.messageId));
        } catch (error) {
          console.error(`[BatchProcessor] Error processing no-value conversation ${conversation.id}:`, error);
          console.error(`[BatchProcessor] Conversation will remain unprocessed and retry on next batch run`);
          // Do NOT mark messages as completed - they will retry
          // Continue processing other conversations
        }
      }

      // 9. Mark only successfully processed messages as COMPLETED
      if (successfullyProcessedMessageIds.size > 0) {
        await this.db.unifiedMessage.updateMany({
          where: { id: { in: Array.from(successfullyProcessedMessageIds) } },
          data: { processingStatus: 'COMPLETED' },
        });
        console.log(`[BatchProcessor] Marked ${successfullyProcessedMessageIds.size} messages as COMPLETED`);
      }

      // 10. Clean up classification data for failed messages so they can be re-classified on retry
      const failedMessageIds = messages
        .map(m => m.id)
        .filter(id => !successfullyProcessedMessageIds.has(id));

      if (failedMessageIds.length > 0) {
        await this.db.messageClassification.deleteMany({
          where: { messageId: { in: failedMessageIds } },
        });
        anyMessagesFailed = true;
        console.warn(`[BatchProcessor] ${failedMessageIds.length} messages remain unprocessed due to errors and will retry (classifications cleaned up)`);
      }

        totalMessagesProcessed += successfullyProcessedMessageIds.size;
        totalProposalsGenerated += iterationProposals;
        console.log(`[BatchProcessor] Iteration ${iteration} complete: ${successfullyProcessedMessageIds.size}/${messages.length} messages successfully processed, ${allConversations.length} conversations (${valuableConversations.length} valuable, ${noValueConversations.length} no-value), ${iterationProposals} proposals`);
      }

        // 9. Update processing watermark only if ALL messages succeeded
        if (!anyMessagesFailed) {
          await this.updateProcessingWatermark(batchEnd);
          console.log(`[BatchProcessor] Batch ${batchNumber} complete: ${totalMessagesProcessed} messages, ${totalConversationsProcessed} conversations, ${totalProposalsGenerated} proposals. Watermark updated to ${batchEnd.toISOString()}`);
        } else {
          console.warn(`[BatchProcessor] Batch ${batchNumber} complete with failures: ${totalMessagesProcessed} messages succeeded, ${totalConversationsProcessed} conversations, ${totalProposalsGenerated} proposals. Watermark NOT updated - failed messages will retry on next run.`);
        }

        // Accumulate totals across all batches
        totalMessagesProcessedAcrossAllBatches += totalMessagesProcessed;
      }

      // All batches processed
      console.log(`[BatchProcessor] ========== ALL BATCHES COMPLETE ==========`);
      console.log(`[BatchProcessor] Total across all batches: ${totalMessagesProcessedAcrossAllBatches} messages`);
      return totalMessagesProcessedAcrossAllBatches;
    } finally {
      // Always clear processing flag
      BatchMessageProcessor.isProcessing = false;
      console.log('[BatchProcessor] Processing flag cleared');
    }
  }

  /**
   * Get current processing watermark
   */
  private async getProcessingWatermark(): Promise<Date> {
    const watermark = await this.db.processingWatermark.findUnique({
      where: { id: 1 },
    });

    if (!watermark) {
      // Initialize watermark to 7 days ago
      const initialWatermark = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await this.db.processingWatermark.create({
        data: {
          id: 1,
          watermarkTime: initialWatermark,
        },
      });
      return initialWatermark;
    }

    return watermark.watermarkTime;
  }

  /**
   * Update processing watermark
   */
  private async updateProcessingWatermark(newTime: Date): Promise<void> {
    await this.db.processingWatermark.upsert({
      where: { id: 1 },
      update: {
        watermarkTime: newTime,
        lastProcessedBatch: new Date(),
      },
      create: {
        id: 1,
        watermarkTime: newTime,
        lastProcessedBatch: new Date(),
      },
    });
  }

  /**
   * Fetch messages for batch window (only PENDING messages)
   */
  private async fetchMessagesForBatch(start: Date, end: Date): Promise<any[]> {
    return await this.db.unifiedMessage.findMany({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
        processingStatus: 'PENDING', // Only fetch messages that haven't been processed yet
      },
      orderBy: {
        timestamp: 'asc',
      },
      take: this.config.maxBatchSize,
    });
  }

  /**
   * Fetch context messages (can include COMPLETED messages for context)
   */
  private async fetchContextMessages(start: Date, end: Date): Promise<any[]> {
    return await this.db.unifiedMessage.findMany({
      where: {
        timestamp: {
          gte: start,
          lt: end,
        },
        // No processingStatus filter - include all messages for context
      },
      orderBy: {
        timestamp: 'asc',
      },
      take: 100, // Limit context messages
    });
  }

  /**
   * Build a map of message reply relationships within the current batch
   * Returns: Map<messageId, { replyToId, depth }>
   * Only includes replies where the original message IS in the current batch
   */
  private buildReplyChainMap(messages: any[]): Map<string, { replyToId: string | null, depth: number }> {
    const chainMap = new Map<string, { replyToId: string | null, depth: number }>();

    // Create lookup by composite messageId ("{chatId}-{messageId}")
    const messageIdSet = new Set(messages.map(m => m.messageId));

    // First pass: identify direct reply relationships within batch
    for (const msg of messages) {
      const replyToMessageId = msg.metadata?.replyToMessageId;
      const chatId = msg.metadata?.chatId;

      if (replyToMessageId && chatId) {
        const replyToCompositeId = `${chatId}-${replyToMessageId}`;

        // Only track reply if original message IS in batch
        if (messageIdSet.has(replyToCompositeId)) {
          chainMap.set(msg.messageId, {
            replyToId: replyToCompositeId,
            depth: 0 // Will be calculated in second pass
          });
        }
      }

      // Non-reply messages or replies to messages outside batch
      if (!chainMap.has(msg.messageId)) {
        chainMap.set(msg.messageId, {
          replyToId: null,
          depth: 0
        });
      }
    }

    // Second pass: calculate depth (indentation level)
    const calculateDepth = (messageId: string, visited: Set<string>): number => {
      if (visited.has(messageId)) return 0; // Circular reference protection

      const chain = chainMap.get(messageId);
      if (!chain || !chain.replyToId) return 0;

      visited.add(messageId);
      return 1 + calculateDepth(chain.replyToId, visited);
    };

    for (const [messageId, chain] of chainMap.entries()) {
      chain.depth = calculateDepth(messageId, new Set());
    }

    return chainMap;
  }

  /**
   * Classify batch of messages
   */
  private async classifyBatch(
    messages: any[],
    contextMessages: any[],
    batchId: string
  ): Promise<BatchClassificationResult> {
    // Build reply chain map for this batch
    const replyChainMap = this.buildReplyChainMap(messages);

    // Format messages for prompt
    const formatMessage = (msg: any) => {
      const chain = replyChainMap.get(msg.messageId);
      const depth = chain?.depth || 0;
      const indent = '  '.repeat(depth); // 2 spaces per level

      let formatted = '';

      // Add reply indicator if this is a reply (depth > 0)
      if (depth > 0) {
        formatted += `${indent}↳ Reply to message above\n`;
      }

      // Add the message itself with indentation
      formatted += `${indent}[${msg.timestamp.toISOString()}] ${msg.author} in ${msg.channel || 'general'}: ${msg.content}`;

      return formatted;
    };

    const contextText = contextMessages.map(formatMessage).join('\n');
    const messagesToAnalyze = messages.map((msg, idx) => {
      return `[MSG_${msg.id}] ${formatMessage(msg)}`;
    }).join('\n\n');

    const systemPrompt = PROMPT_TEMPLATES.threadClassification.system;

    const config = InstanceConfigLoader.get(this.instanceId);
    const userPrompt = fillTemplate(PROMPT_TEMPLATES.threadClassification.user, {
      projectName: config.project.name,
      contextText: contextText || '(No context messages)',
      messagesToAnalyze
    });

    console.log(`[BatchProcessor] Classifying batch with ${messages.length} messages and ${contextMessages.length} context messages`);

    const { data } = await llmService.requestJSON(
      {
        model: this.config.classificationModel,
        systemPrompt,
        userPrompt,
        maxTokens: 32768, // Gemini 2.5 Flash supports up to 65,536 output tokens
      },
      BatchClassificationResultSchema,
      'analysis',
      undefined // No single messageId for batch classification
    );

    return data;
  }

  /**
   * Store classification results in database for ALL threads (valuable + no-value)
   */
  private async storeClassificationResults(
    allThreads: Array<{
      category: string;
      messages: number[];
      summary: string;
      docValueReason: string;
      ragSearchCriteria: { keywords: string[]; semanticQuery: string };
    }>,
    batchId: string,
    conversations: ConversationGroup[],
    allMessages: any[]
  ): Promise<void> {
    // Track which messages have been classified
    const classifiedMessageIds = new Set<number>();

    // Create a map of messageId -> conversationId for valuable threads
    const messageToConversationMap = new Map<number, string>();
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        messageToConversationMap.set(message.messageId, conversation.id);
      }
    }

    // Iterate over ALL threads (valuable + no-value) and create classification records
    for (const thread of allThreads) {
      const isNoValue = thread.category === 'no-doc-value';

      for (const messageId of thread.messages) {
        classifiedMessageIds.add(messageId);

        // Get conversationId if this message is in a valuable conversation
        const conversationId = messageToConversationMap.get(messageId) || null;

        // Use upsert to handle retries where classification may already exist
        await this.db.messageClassification.upsert({
          where: { messageId },
          update: {
            batchId,
            conversationId, // null for no-value threads
            category: thread.category,
            docValueReason: thread.docValueReason,
            suggestedDocPage: null,
            ragSearchCriteria: isNoValue ? null : thread.ragSearchCriteria,
            modelUsed: this.config.classificationModel,
          },
          create: {
            messageId,
            batchId,
            conversationId, // null for no-value threads
            category: thread.category,
            docValueReason: thread.docValueReason,
            suggestedDocPage: null,
            ragSearchCriteria: isNoValue ? null : thread.ragSearchCriteria,
            modelUsed: this.config.classificationModel,
          },
        });
      }
    }

    // Safety net: Create classification records for any messages the LLM missed
    // This should rarely happen now that we instruct the LLM to classify EVERY message
    const missedMessages = allMessages.filter(msg => !classifiedMessageIds.has(msg.id));
    if (missedMessages.length > 0) {
      console.warn(`[BatchProcessor] LLM missed ${missedMessages.length} messages - creating fallback classifications`);
      for (const message of missedMessages) {
        // Use upsert to handle retries where classification may already exist
        await this.db.messageClassification.upsert({
          where: { messageId: message.id },
          update: {
            batchId,
            conversationId: null,
            category: 'no-doc-value',
            docValueReason: 'LLM classification error: Message was not included in any thread during batch processing',
            suggestedDocPage: null,
            ragSearchCriteria: null,
            modelUsed: this.config.classificationModel,
          },
          create: {
            messageId: message.id,
            batchId,
            conversationId: null,
            category: 'no-doc-value',
            docValueReason: 'LLM classification error: Message was not included in any thread during batch processing',
            suggestedDocPage: null,
            ragSearchCriteria: null,
            modelUsed: this.config.classificationModel,
          },
        });
      }
    }

    console.log(`[BatchProcessor] Stored classifications for ${classifiedMessageIds.size} messages in conversations and ${missedMessages.length} fallback classifications`);
  }

  /**
   * Convert LLM-grouped threads to ConversationGroup format
   */
  private async convertThreadsToConversations(
    threads: Array<{
      category: string;
      messages: number[];
      summary: string; // Thread summary from LLM
      docValueReason: string;
      ragSearchCriteria: { keywords: string[]; semanticQuery: string };
    }>,
    allMessages: any[],
    batchId: string
  ): Promise<ConversationGroup[]> {
    if (threads.length === 0) {
      return [];
    }

    const conversations: ConversationGroup[] = [];

    for (const thread of threads) {
      // Get full message details for all messages in thread
      const messageDetails = thread.messages.map(messageId => {
        const msg = allMessages.find(m => m.id === messageId);
        if (!msg) {
          console.warn(`Message ${messageId} not found in batch, skipping`);
          return null;
        }
        return {
          messageId: msg.id,
          timestamp: msg.timestamp,
          author: msg.author,
          content: msg.content,
          channel: msg.channel,
          category: thread.category,
          docValueReason: thread.docValueReason,
          ragSearchCriteria: thread.ragSearchCriteria,
        };
      }).filter(m => m !== null);

      if (messageDetails.length === 0) {
        console.warn(`Thread has no valid messages, skipping`);
        continue;
      }

      // Sort messages by timestamp
      messageDetails.sort((a, b) => a!.timestamp.getTime() - b!.timestamp.getTime());

      const firstMsg = messageDetails[0]!;
      const lastMsg = messageDetails[messageDetails.length - 1]!;

      conversations.push({
        id: `thread_${firstMsg.channel || 'general'}_${firstMsg.timestamp.getTime()}`,
        channel: firstMsg.channel,
        summary: thread.summary, // Thread summary from LLM
        messages: messageDetails as any[],
        timeStart: firstMsg.timestamp,
        timeEnd: lastMsg.timestamp,
        messageCount: messageDetails.length,
      });
    }

    return conversations;
  }

  /**
   * Check if there's a significant time gap between messages
   * A gap is significant if it exceeds the conversation time window
   */
  private isSignificantGap(lastTime: Date, currentTime: Date): boolean {
    const gapMinutes = (currentTime.getTime() - lastTime.getTime()) / (1000 * 60);
    return gapMinutes > this.config.conversationTimeWindowMinutes;
  }

  /**
   * Process a conversation group (RAG + Changeset Proposals)
   */
  private async processConversation(conversation: ConversationGroup, batchId: string): Promise<number> {
    console.log(`[BatchProcessor] Processing conversation ${conversation.id} (${conversation.messageCount} messages)`);

    // 1. Perform RAG retrieval once for the entire conversation
    const ragDocs = await this.performConversationRAG(conversation);

    // 2. Store RAG context for the conversation
    // Truncate summary to 200 characters to fit in database VARCHAR(200)
    const truncatedSummary = conversation.summary.length > 200
      ? conversation.summary.substring(0, 197) + '...'
      : conversation.summary;

    // Store only metadata in retrievedDocs (remove full content to reduce JSON size)
    const ragDocsMetadata = ragDocs.map(doc => ({
      docId: doc.docId,
      title: doc.title,
      filePath: doc.filePath,
      similarity: doc.similarity,
      contentPreview: doc.content ? doc.content.substring(0, 1000) + '...' : '', // Store 1000 char preview
    }));

    await this.db.conversationRagContext.create({
      data: {
        conversationId: conversation.id,
        batchId,
        retrievedDocs: ragDocsMetadata,
        totalTokens: this.estimateTokens(ragDocs),
        summary: truncatedSummary,
      },
    });

    // 3. Generate changeset proposals for the conversation
    const { proposals, proposalsRejected, rejectionReason } = await this.generateConversationProposals(conversation, ragDocs);

    // 3.5. Update RAG context with rejection info if proposals were rejected
    if (proposalsRejected || rejectionReason) {
      await this.db.conversationRagContext.update({
        where: { conversationId: conversation.id },
        data: {
          proposalsRejected: proposalsRejected ?? null,
          rejectionReason: rejectionReason ?? null,
        },
      });
    }

    // 4. Store proposals (multiple proposals per conversation)
    // NOTE: Store ALL proposals including NONE type to capture LLM reasoning
    let proposalCount = 0;
    for (const proposal of proposals) {
      await this.db.docProposal.create({
        data: {
          conversationId: conversation.id,
          batchId,
          page: proposal.page,
          updateType: proposal.updateType,
          section: proposal.section || null,
          location: proposal.location || null,
          suggestedText: proposal.suggestedText || null,
          reasoning: proposal.reasoning || null,
          sourceMessages: proposal.sourceMessages || null,
          modelUsed: this.config.proposalModel,
        },
      });
      proposalCount++;
    }

    // Note: Messages are marked as COMPLETED earlier in processBatch() after classification
    const rejectionMsg = proposalsRejected ? ` (Rejected: ${rejectionReason})` : '';
    console.log(`[BatchProcessor] Conversation ${conversation.id} complete. Generated ${proposalCount} proposals${rejectionMsg}`);
    return proposalCount;
  }

  /**
   * Process a no-doc-value conversation by creating RAG context with rejection
   * This ensures no-value messages appear in the Discarded tab
   */
  private async processNoValueConversation(
    conversation: ConversationGroup,
    batchId: string
  ): Promise<void> {
    // Truncate summary to 200 characters to fit in database VARCHAR(200)
    const truncatedSummary = conversation.summary.length > 200
      ? conversation.summary.substring(0, 197) + '...'
      : conversation.summary;

    // Create RAG context with rejection marker
    await this.db.conversationRagContext.create({
      data: {
        conversationId: conversation.id,
        batchId,
        retrievedDocs: [], // No RAG docs for no-value conversations
        totalTokens: 0,
        summary: truncatedSummary,
        proposalsRejected: true,
        rejectionReason: conversation.messages[0]?.docValueReason || 'Classified as no documentation value',
      },
    });

    console.log(`[BatchProcessor] No-value conversation ${conversation.id} marked as discarded: ${conversation.messages[0]?.docValueReason}`);
  }

  /**
   * Perform RAG retrieval for an entire conversation
   * Combines all messages in conversation to build comprehensive search query
   */
  private async performConversationRAG(conversation: ConversationGroup): Promise<any[]> {
    // Build comprehensive search query from all messages in conversation
    const allContent = conversation.messages
      .map(m => m.content)
      .join(' ');

    // Combine all RAG search criteria
    const allKeywords = new Set<string>();
    const semanticQueries: string[] = [];

    for (const msg of conversation.messages) {
      if (msg.ragSearchCriteria?.keywords) {
        msg.ragSearchCriteria.keywords.forEach((kw: string) => allKeywords.add(kw));
      }
      if (msg.ragSearchCriteria?.semanticQuery) {
        semanticQueries.push(msg.ragSearchCriteria.semanticQuery);
      }
    }

    // Use combined semantic query or fall back to conversation content
    const searchQuery = semanticQueries.length > 0
      ? semanticQueries.join(' ')
      : allContent.substring(0, 500); // Limit to avoid overly long queries

    console.log(`[BatchProcessor] RAG search for conversation: "${searchQuery.substring(0, 100)}..."`);

    const results = await this.messageVectorSearch.searchSimilarDocs(
      searchQuery,
      this.config.ragTopK * 2 // Fetch more to account for translations
    );

    // Helper function to get base path (removing i18n language prefixes)
    const getBasePath = (filePath: string): string => {
      // Remove i18n language prefixes like i18n/es/, i18n/ja/, etc.
      return filePath.replace(/^i18n\/[^/]+\/docusaurus-plugin-content-docs\/current\//, 'docs/');
    };

    // First deduplicate by docId
    const uniqueById = new Map();
    for (const r of results) {
      if (!uniqueById.has(r.id) || r.distance > uniqueById.get(r.id).similarity) {
        uniqueById.set(r.id, {
          docId: r.id,
          title: r.title,
          filePath: r.file_path,
          content: r.content,
          similarity: r.distance,
        });
      }
    }

    // Second, deduplicate by base path (keep only English version)
    const uniqueByBasePath = new Map();
    for (const doc of uniqueById.values()) {
      const basePath = getBasePath(doc.filePath);
      const isEnglish = !doc.filePath.startsWith('i18n/');

      if (!uniqueByBasePath.has(basePath)) {
        // First occurrence - add it
        uniqueByBasePath.set(basePath, doc);
      } else {
        const existing = uniqueByBasePath.get(basePath);
        // Replace if this is English and existing is not, or if both same language but higher similarity
        if ((isEnglish && existing.filePath.startsWith('i18n/')) ||
            (isEnglish === existing.filePath.startsWith('i18n/') && doc.similarity > existing.similarity)) {
          uniqueByBasePath.set(basePath, doc);
        }
      }
    }

    const dedupedDocs = Array.from(uniqueByBasePath.values())
      .slice(0, this.config.ragTopK); // Limit to original topK after deduplication

    console.log(`[BatchProcessor] Retrieved ${results.length} docs, deduplicated to ${dedupedDocs.length} unique docs (removed ${results.length - dedupedDocs.length} translations)`);
    return dedupedDocs;
  }

  /**
   * Generate documentation changesets for a conversation
   */
  private async generateConversationProposals(
    conversation: ConversationGroup,
    ragDocs: any[]
  ): Promise<Array<ProposalGeneration>> {
    const systemPrompt = PROMPT_TEMPLATES.changesetGeneration.system;

    const ragContext = ragDocs.map((doc, idx) => {
      return `[DOC ${idx + 1}] ${doc.title}
File Path: ${doc.filePath}
Similarity: ${doc.similarity.toFixed(3)}
Length: ${doc.content.length} chars

COMPLETE FILE CONTENT:
${doc.content}`;
    }).join('\n\n========================================\n\n');

    // Format conversation messages
    const conversationContext = conversation.messages.map((msg, idx) => {
      return `[MESSAGE ${idx + 1}] (ID: ${msg.messageId})
Author: ${msg.author}
Time: ${msg.timestamp.toISOString()}
Category: ${msg.category}
Reason: ${msg.docValueReason}
Suggested Page: ${msg.suggestedDocPage || 'Not specified'}
Content: ${msg.content}`;
    }).join('\n\n');

    const config = InstanceConfigLoader.get(this.instanceId);
    const userPrompt = fillTemplate(PROMPT_TEMPLATES.changesetGeneration.user, {
      projectName: config.project.name,
      messageCount: conversation.messageCount,
      channel: conversation.channel || 'general',
      conversationContext,
      ragContext: ragContext || '(No relevant docs found)'
    });

    console.log(`[BatchProcessor] Generating changeset for conversation ${conversation.id}`);

    const responseSchema = z.object({
      proposals: z.array(ProposalGenerationSchema).max(10, 'Maximum 10 proposals per conversation'),
      proposalsRejected: z.boolean().optional(),
      rejectionReason: z.string().optional(),
    });

    const { data } = await llmService.requestJSON(
      {
        model: this.config.proposalModel,
        systemPrompt,
        userPrompt,
        maxTokens: 32768, // Gemini 2.5 Flash supports up to 65,536 output tokens
      },
      responseSchema,
      'changegeneration',
      undefined // No single messageId for conversation
    );

    console.log(`[BatchProcessor] Conversation ${conversation.id}: LLM proposed ${data.proposals.length} changes`);

    // Return both proposals and rejection info
    return {
      proposals: data.proposals,
      proposalsRejected: data.proposalsRejected,
      rejectionReason: data.rejectionReason,
    };
  }

  /**
   * Estimate token count for RAG docs
   */
  private estimateTokens(ragDocs: any[]): number {
    const totalChars = ragDocs.reduce((sum, doc) => sum + doc.content.length, 0);
    return Math.ceil(totalChars / 4); // Rough estimate: 4 chars per token
  }
}
