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

import { PrismaClient, Prisma } from '@prisma/client';
import { llmService } from '../llm/llm-service.js';
import { MessageVectorSearch } from '../message-vector-search.js';
import { PROMPT_TEMPLATES, fillTemplate } from '../llm/prompt-templates.js';
import { InstanceConfigLoader } from '../../config/instance-loader.js';
import { createLogger } from '../../utils/logger.js';
import { postProcessProposal } from '../../pipeline/utils/ProposalPostProcessor.js';
import { z } from 'zod';

// Pipeline integration imports
import {
  loadPipelineConfig,
  clearPipelineConfigCache,
} from '../../pipeline/config/PipelineConfigLoader.js';
import { PipelineOrchestrator } from '../../pipeline/core/PipelineOrchestrator.js';
import { createPipelineContext } from '../../pipeline/core/PipelineContext.js';
import { createPromptRegistry, PromptRegistry } from '../../pipeline/prompts/PromptRegistry.js';
import { createGeminiHandler, GeminiHandler } from '../../pipeline/handlers/GeminiHandler.js';
import type {
  PipelineConfig,
  Proposal as PipelineProposal,
  IDomainConfig,
  ConversationThread,
} from '../../pipeline/core/interfaces.js';
import { StepType } from '../../pipeline/core/interfaces.js';
import { parseRuleset, hasRules, type ParsedRuleset } from '../../pipeline/types/ruleset.js';
import {
  type ProposalEnrichment,
  type RelatedDoc,
  type StyleMetrics,
  createEmptyEnrichment,
  textAnalysis,
} from '../../pipeline/types/enrichment.js';

const logger = createLogger('BatchProcessor');

// ========== Batch Classification Schema ==========

const BatchClassificationResultSchema = z.object({
  threads: z.array(
    z.object({
      category: z.string().max(50, 'Category must be 50 characters or less'),
      messages: z.array(z.number()).min(1, 'Thread must contain at least one message'),
      summary: z.string().max(200, 'Thread summary must be 200 characters or less'),
      docValueReason: z
        .string()
        .max(300, 'Documentation value reason must be 300 characters or less'),
      ragSearchCriteria: z.object({
        keywords: z.array(z.string().max(50, 'Keywords must be 50 characters or less')),
        semanticQuery: z.string().max(200, 'Semantic query must be 200 characters or less'),
      }),
    })
  ),
  batchSummary: z.string().max(500, 'Batch summary must be 500 characters or less'),
});

type BatchClassificationResult = z.infer<typeof BatchClassificationResultSchema>;

// ========== Proposal Generation Schema ==========

const ProposalGenerationSchema = z.object({
  updateType: z.enum(['INSERT', 'UPDATE', 'DELETE', 'NONE']),
  page: z.string().max(150, 'Page path must be 150 characters or less'),
  section: z.string().max(100, 'Section name must be 100 characters or less').optional(),
  location: z
    .object({
      lineStart: z.number().optional(),
      lineEnd: z.number().optional(),
      sectionName: z.string().max(100, 'Section name must be 100 characters or less').optional(),
    })
    .optional(),
  suggestedText: z.string().max(2000, 'Suggested text must be 2000 characters or less').optional(),
  reasoning: z.string().max(300, 'Reasoning must be 300 characters or less'),
  sourceMessages: z.array(z.number()).optional(), // Message IDs that led to this proposal
  warnings: z.array(z.string()).optional(), // Validation warnings from pipeline post-processing
});

type ProposalGeneration = z.infer<typeof ProposalGenerationSchema>;

/**
 * Extended proposal with enrichment and review data
 */
interface EnrichedProposal extends ProposalGeneration {
  enrichment?: ProposalEnrichment;
  reviewResult?: {
    rejected: boolean;
    rejectionReason?: string;
    rejectionRule?: string;
    modificationsApplied: string[];
    qualityFlags: string[];
    modifiedContent?: string;
    originalContent?: string;
  };
}

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
  batchWindowHours: number; // 24 hours
  contextWindowHours: number; // 24 hours (previous batch)
  maxBatchSize: number; // Maximum messages per batch
  classificationModel: string;
  proposalModel: string;
  ragTopK: number; // Number of docs to retrieve for RAG
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

  // Pipeline integration
  private pipelineConfig: PipelineConfig | null = null;
  private promptRegistry: PromptRegistry | null = null;
  private llmHandler: GeminiHandler | null = null;
  private pipelineInitialized: boolean = false;

  // Quality system integration
  private cachedRuleset: ParsedRuleset | null = null;
  private rulesetLoadedAt: Date | null = null;
  private rulesetUpdatedAt: Date | null = null;
  private readonly RULESET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(instanceId: string, db: PrismaClient, config: Partial<BatchProcessorConfig> = {}) {
    this.instanceId = instanceId;
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.messageVectorSearch = new MessageVectorSearch(instanceId, db);
    logger.info(`[${instanceId}] BatchMessageProcessor initialized`);
  }

  /**
   * Initialize pipeline components (lazy initialization)
   * Loads config from S3 if CONFIG_SOURCE=s3, otherwise from local files
   */
  private async initializePipeline(): Promise<void> {
    if (this.pipelineInitialized) return;

    try {
      const configBasePath = process.env.CONFIG_BASE_PATH || './config';

      // Load pipeline config (with S3 support)
      this.pipelineConfig = await loadPipelineConfig(configBasePath, this.instanceId, 'validators');
      logger.info(`Loaded pipeline config: ${this.pipelineConfig.pipelineId}`, {
        steps: this.pipelineConfig.steps.map((s) => `${s.stepId}:${s.enabled}`),
      });

      // Initialize prompt registry
      this.promptRegistry = createPromptRegistry(configBasePath, this.instanceId);
      await this.promptRegistry.load();
      logger.debug(`Loaded ${this.promptRegistry.list().length} prompt templates`);

      // Initialize LLM handler
      this.llmHandler = createGeminiHandler();

      this.pipelineInitialized = true;
    } catch (error) {
      logger.warn('Failed to initialize pipeline, post-processing steps will be skipped:', error);
      this.pipelineInitialized = true; // Don't retry on every batch
    }
  }

  /**
   * Clear pipeline cache (useful for hot-reload of configs)
   */
  clearPipelineCache(): void {
    clearPipelineConfigCache();
    this.pipelineInitialized = false;
    this.pipelineConfig = null;
    this.promptRegistry = null;
    this.cachedRuleset = null;
    this.rulesetLoadedAt = null;
    this.rulesetUpdatedAt = null;
    logger.info('Pipeline cache cleared');
  }

  /**
   * Load tenant ruleset for PROMPT_CONTEXT injection
   * Cached for RULESET_CACHE_TTL_MS to avoid repeated DB queries
   */
  private async loadTenantRuleset(): Promise<ParsedRuleset | null> {
    // Check cache validity
    if (
      this.cachedRuleset &&
      this.rulesetLoadedAt &&
      Date.now() - this.rulesetLoadedAt.getTime() < this.RULESET_CACHE_TTL_MS
    ) {
      return this.cachedRuleset;
    }

    try {
      const ruleset = await this.db.tenantRuleset.findFirst({
        where: { tenantId: this.instanceId },
        orderBy: { updatedAt: 'desc' },
      });

      if (!ruleset || !ruleset.content) {
        logger.debug(`[${this.instanceId}] No tenant ruleset found`);
        this.cachedRuleset = null;
        this.rulesetLoadedAt = new Date();
        this.rulesetUpdatedAt = null;
        return null;
      }

      this.cachedRuleset = parseRuleset(ruleset.content);
      this.rulesetLoadedAt = new Date();
      this.rulesetUpdatedAt = ruleset.updatedAt;

      if (this.cachedRuleset.promptContext.length > 0) {
        logger.info(
          `[${this.instanceId}] Loaded ruleset with ${this.cachedRuleset.promptContext.length} PROMPT_CONTEXT rules`
        );
      }

      return this.cachedRuleset;
    } catch (error) {
      logger.warn(`[${this.instanceId}] Failed to load tenant ruleset:`, error);
      return null;
    }
  }

  /**
   * Build system prompt with PROMPT_CONTEXT injection
   */
  private buildChangesetSystemPrompt(ruleset: ParsedRuleset | null): string {
    let systemPrompt = PROMPT_TEMPLATES.changesetGeneration.system;

    // Inject PROMPT_CONTEXT if available
    if (ruleset && ruleset.promptContext.length > 0) {
      const contextRules = ruleset.promptContext.map((rule) => `- ${rule}`).join('\n');
      const promptContextSection = `

## Quality Guidelines (Instance-Specific)
The following quality guidelines MUST be followed when generating proposals:
${contextRules}
`;
      // Insert before the closing instructions
      systemPrompt = systemPrompt + promptContextSection;
      logger.debug(
        `[${this.instanceId}] Injected ${ruleset.promptContext.length} PROMPT_CONTEXT rules`
      );
    }

    return systemPrompt;
  }

  /**
   * Run enrichment and ruleset review on proposals
   * Returns enriched proposals with review results
   */
  private async runEnrichmentAndReview(
    proposals: ProposalGeneration[],
    conversation: ConversationGroup,
    ragDocs: any[],
    ruleset: ParsedRuleset | null
  ): Promise<EnrichedProposal[]> {
    const enrichedProposals: EnrichedProposal[] = [];

    // Count pending proposals for context
    let pendingProposalCount = 0;
    try {
      pendingProposalCount = await this.db.docProposal.count({
        where: { status: 'pending' },
      });
    } catch {
      logger.warn('Could not fetch pending proposal count');
    }

    for (const proposal of proposals) {
      const enriched: EnrichedProposal = { ...proposal };

      // Skip enrichment for NONE type proposals
      if (proposal.updateType === 'NONE') {
        enrichedProposals.push(enriched);
        continue;
      }

      // 1. Run enrichment
      try {
        enriched.enrichment = this.enrichProposal(
          proposal,
          ragDocs,
          conversation.messages,
          pendingProposalCount
        );
        logger.debug(`Enriched proposal for ${proposal.page}`, {
          relatedDocs: enriched.enrichment.relatedDocs.length,
          duplicationDetected: enriched.enrichment.duplicationWarning.detected,
        });
      } catch (error) {
        logger.warn(`Failed to enrich proposal for ${proposal.page}:`, error);
        enriched.enrichment = createEmptyEnrichment();
      }

      // 2. Apply ruleset review if ruleset has rules
      if (ruleset && hasRules(ruleset)) {
        try {
          enriched.reviewResult = this.applyRulesetReview(ruleset, enriched);

          const reviewResult = enriched.reviewResult;
          if (reviewResult?.rejected) {
            logger.info(`Proposal for ${proposal.page} rejected by ruleset`, {
              rule: reviewResult.rejectionRule,
              reason: reviewResult.rejectionReason,
            });
          } else if (reviewResult?.qualityFlags && reviewResult.qualityFlags.length > 0) {
            logger.debug(`Proposal for ${proposal.page} flagged`, {
              flags: reviewResult.qualityFlags,
            });
          }
        } catch (error) {
          logger.warn(`Failed to apply ruleset review for ${proposal.page}:`, error);
        }
      }

      enrichedProposals.push(enriched);
    }

    return enrichedProposals;
  }

  /**
   * Enrich a single proposal with context analysis
   */
  private enrichProposal(
    proposal: ProposalGeneration,
    ragDocs: any[],
    messages: ConversationGroup['messages'],
    pendingProposalCount: number
  ): ProposalEnrichment {
    const enrichment = createEmptyEnrichment();

    // 1. Find related documentation
    enrichment.relatedDocs = this.findRelatedDocs(proposal, ragDocs);

    // 2. Check for duplication
    if (proposal.suggestedText) {
      enrichment.duplicationWarning = this.checkDuplication(proposal, ragDocs);
    }

    // 3. Analyze style consistency
    enrichment.styleAnalysis = this.analyzeStyle(proposal, ragDocs);

    // 4. Calculate change context
    enrichment.changeContext = this.calculateChangeContext(proposal, ragDocs, pendingProposalCount);

    // 5. Analyze source conversation
    enrichment.sourceAnalysis = this.analyzeSourceConversation(messages);

    return enrichment;
  }

  /**
   * Find related documentation for a proposal
   */
  private findRelatedDocs(proposal: ProposalGeneration, ragDocs: any[]): RelatedDoc[] {
    const relatedDocs: RelatedDoc[] = [];
    const seenPages = new Set<string>();
    const minSimilarity = 0.6;
    const maxDocs = 5;

    for (const doc of ragDocs) {
      if (doc.similarity >= minSimilarity && !seenPages.has(doc.filePath)) {
        const matchType =
          doc.filePath === proposal.page
            ? 'same-section'
            : doc.similarity >= 0.8
              ? 'semantic'
              : 'keyword';

        relatedDocs.push({
          page: doc.filePath,
          section: doc.title,
          similarityScore: doc.similarity,
          matchType: matchType as 'semantic' | 'keyword' | 'same-section',
          snippet: doc.content.slice(0, 200) + (doc.content.length > 200 ? '...' : ''),
        });
        seenPages.add(doc.filePath);

        if (relatedDocs.length >= maxDocs) break;
      }
    }

    return relatedDocs.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  /**
   * Check for duplication with existing documentation
   */
  private checkDuplication(
    proposal: ProposalGeneration,
    ragDocs: any[]
  ): ProposalEnrichment['duplicationWarning'] {
    if (!proposal.suggestedText) {
      return { detected: false };
    }

    const duplicationThreshold = 50;
    let maxOverlap = 0;
    let matchingPage: string | undefined;
    let matchingSection: string | undefined;

    for (const doc of ragDocs) {
      const overlap = textAnalysis.ngramOverlap(proposal.suggestedText, doc.content, 3);

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        matchingPage = doc.filePath;
        matchingSection = doc.title;
      }
    }

    return {
      detected: maxOverlap >= duplicationThreshold,
      matchingPage: maxOverlap >= duplicationThreshold ? matchingPage : undefined,
      matchingSection: maxOverlap >= duplicationThreshold ? matchingSection : undefined,
      overlapPercentage: maxOverlap,
    };
  }

  /**
   * Analyze style consistency between proposal and target page
   */
  private analyzeStyle(
    proposal: ProposalGeneration,
    ragDocs: any[]
  ): ProposalEnrichment['styleAnalysis'] {
    const targetDoc = ragDocs.find((d) => d.filePath === proposal.page);
    const targetContent = targetDoc?.content || '';
    const proposalContent = proposal.suggestedText || '';

    const targetPageStyle: StyleMetrics = {
      avgSentenceLength: textAnalysis.avgSentenceLength(targetContent),
      usesCodeExamples: textAnalysis.hasCodeExamples(targetContent),
      formatPattern: textAnalysis.detectFormatPattern(targetContent),
      technicalDepth: textAnalysis.estimateTechnicalDepth(targetContent),
    };

    const proposalStyle: StyleMetrics = {
      avgSentenceLength: textAnalysis.avgSentenceLength(proposalContent),
      usesCodeExamples: textAnalysis.hasCodeExamples(proposalContent),
      formatPattern: textAnalysis.detectFormatPattern(proposalContent),
      technicalDepth: textAnalysis.estimateTechnicalDepth(proposalContent),
    };

    const consistencyNotes: string[] = [];

    if (targetContent) {
      if (targetPageStyle.formatPattern !== proposalStyle.formatPattern) {
        consistencyNotes.push(
          `Format mismatch: target uses ${targetPageStyle.formatPattern}, proposal uses ${proposalStyle.formatPattern}`
        );
      }

      if (targetPageStyle.technicalDepth !== proposalStyle.technicalDepth) {
        consistencyNotes.push(
          `Technical depth mismatch: target is ${targetPageStyle.technicalDepth}, proposal is ${proposalStyle.technicalDepth}`
        );
      }

      if (targetPageStyle.usesCodeExamples && !proposalStyle.usesCodeExamples) {
        consistencyNotes.push('Target page uses code examples but proposal does not');
      }
    }

    return { targetPageStyle, proposalStyle, consistencyNotes };
  }

  /**
   * Calculate change impact context
   */
  private calculateChangeContext(
    proposal: ProposalGeneration,
    ragDocs: any[],
    pendingProposalCount: number
  ): ProposalEnrichment['changeContext'] {
    const targetDoc = ragDocs.find((d) => d.filePath === proposal.page);
    const targetContent = targetDoc?.content || '';
    const proposalContent = proposal.suggestedText || '';

    const targetCharCount = targetContent.length;
    const proposalCharCount = proposalContent.length;

    let changePercentage = 0;
    if (proposal.updateType === 'INSERT' || proposal.updateType === 'DELETE') {
      changePercentage = 100;
    } else if (targetCharCount > 0) {
      const diff = Math.abs(targetCharCount - proposalCharCount);
      changePercentage = Math.round((diff / targetCharCount) * 100);
    }

    return {
      targetSectionCharCount: targetCharCount,
      proposalCharCount: proposalCharCount,
      changePercentage: Math.min(changePercentage, 100),
      lastUpdated: null,
      otherPendingProposals: pendingProposalCount,
    };
  }

  /**
   * Analyze the source conversation
   */
  private analyzeSourceConversation(
    messages: ConversationGroup['messages']
  ): ProposalEnrichment['sourceAnalysis'] {
    if (messages.length === 0) {
      return {
        messageCount: 0,
        uniqueAuthors: 0,
        threadHadConsensus: false,
        conversationSummary: '',
      };
    }

    const uniqueAuthors = new Set(messages.map((m) => m.author)).size;
    const threadHadConsensus = uniqueAuthors >= 2 && messages.length >= 3;

    const allContent = messages.map((m) => m.content).join(' ');
    const conversationSummary =
      allContent.length > 200 ? allContent.slice(0, 200) + '...' : allContent || 'No content';

    return {
      messageCount: messages.length,
      uniqueAuthors,
      threadHadConsensus,
      conversationSummary,
    };
  }

  /**
   * Apply ruleset review rules to a proposal
   */
  private applyRulesetReview(
    ruleset: ParsedRuleset,
    proposal: EnrichedProposal
  ): EnrichedProposal['reviewResult'] {
    const result = {
      rejected: false,
      modificationsApplied: [] as string[],
      qualityFlags: [] as string[],
      originalContent: proposal.suggestedText || undefined,
    };

    const enrichment = proposal.enrichment;

    // 1. Check rejection rules
    for (const rule of ruleset.rejectionRules) {
      const ruleLower = rule.toLowerCase();

      // Check duplication-based rules
      if (enrichment?.duplicationWarning?.detected) {
        if (ruleLower.includes('duplicationwarning') && ruleLower.includes('overlappercentage')) {
          const thresholdMatch = rule.match(/>\s*(\d+)/);
          const threshold = thresholdMatch ? parseInt(thresholdMatch[1], 10) : 80;

          if ((enrichment.duplicationWarning.overlapPercentage || 0) > threshold) {
            return {
              ...result,
              rejected: true,
              rejectionReason: `Duplicate content detected: ${enrichment.duplicationWarning.overlapPercentage}% overlap with ${enrichment.duplicationWarning.matchingPage}`,
              rejectionRule: rule,
            };
          }
        }
      }

      // Check similarity-based rules
      if (enrichment?.relatedDocs && ruleLower.includes('similarityscore')) {
        const thresholdMatch = rule.match(/>\s*(\d*\.?\d+)/);
        const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0.85;

        for (const doc of enrichment.relatedDocs) {
          if (doc.similarityScore > threshold) {
            return {
              ...result,
              rejected: true,
              rejectionReason: `High similarity with existing doc: ${Math.round(doc.similarityScore * 100)}% match with ${doc.page}`,
              rejectionRule: rule,
            };
          }
        }
      }

      // Check content pattern rules
      if (proposal.suggestedText) {
        if (ruleLower.includes('proposals mentioning') || ruleLower.includes('containing')) {
          const patternMatch = rule.match(/(?:mentioning|containing)\s+["']?([^"']+)["']?/i);
          if (patternMatch) {
            const pattern = patternMatch[1].trim();
            if (proposal.suggestedText.toLowerCase().includes(pattern.toLowerCase())) {
              return {
                ...result,
                rejected: true,
                rejectionReason: `Content matches rejection pattern: "${pattern}"`,
                rejectionRule: rule,
              };
            }
          }
        }
      }
    }

    // 2. Check quality gates (flagging without rejection)
    for (const gate of ruleset.qualityGates) {
      const gateLower = gate.toLowerCase();

      if (
        enrichment?.styleAnalysis &&
        gateLower.includes('consistencynotes') &&
        (gateLower.includes('not empty') || gateLower.includes('is not empty'))
      ) {
        if (enrichment.styleAnalysis.consistencyNotes.length > 0) {
          result.qualityFlags.push(
            `Style review: ${enrichment.styleAnalysis.consistencyNotes.join(', ')}`
          );
        }
      }

      if (enrichment?.changeContext && gateLower.includes('changepercentage')) {
        const thresholdMatch = gate.match(/>\s*(\d+)/);
        const threshold = thresholdMatch ? parseInt(thresholdMatch[1], 10) : 50;

        if (enrichment.changeContext.changePercentage > threshold) {
          result.qualityFlags.push(
            `Significant change: ${enrichment.changeContext.changePercentage}% modification`
          );
        }
      }

      if (
        enrichment?.changeContext &&
        gateLower.includes('otherpendingproposals') &&
        gateLower.includes('> 0')
      ) {
        if (enrichment.changeContext.otherPendingProposals > 0) {
          result.qualityFlags.push(
            `Coordination needed: ${enrichment.changeContext.otherPendingProposals} other pending proposals`
          );
        }
      }

      if (enrichment?.sourceAnalysis && gateLower.includes('messagecount')) {
        const thresholdMatch = gate.match(/<\s*(\d+)/);
        if (thresholdMatch) {
          const threshold = parseInt(thresholdMatch[1], 10);
          if (enrichment.sourceAnalysis.messageCount < threshold) {
            result.qualityFlags.push(
              `Limited evidence: only ${enrichment.sourceAnalysis.messageCount} messages`
            );
          }
        }
      }
    }

    return result;
  }

  /**
   * Run pipeline post-processing steps (VALIDATE, CONDENSE) on proposals
   * Returns processed proposals array
   */
  private async runPipelinePostProcessing(
    proposals: ProposalGeneration[],
    conversation: ConversationGroup,
    batchId: string
  ): Promise<ProposalGeneration[]> {
    // Check if pipeline is available and has post-processing steps enabled
    if (!this.pipelineConfig || !this.promptRegistry || !this.llmHandler) {
      return proposals;
    }

    // Find enabled post-processing steps
    const validateStep = this.pipelineConfig.steps.find(
      (s) => s.stepType === StepType.VALIDATE && s.enabled
    );
    const condenseStep = this.pipelineConfig.steps.find(
      (s) => s.stepType === StepType.CONDENSE && s.enabled
    );

    if (!validateStep && !condenseStep) {
      return proposals;
    }

    logger.debug(`Running pipeline post-processing for ${conversation.id}`, {
      validate: !!validateStep,
      condense: !!condenseStep,
      proposalCount: proposals.length,
    });

    // Build minimal domain config for post-processing
    const instanceConfig = InstanceConfigLoader.get(this.instanceId);
    const domainConfig: IDomainConfig = {
      domainId: this.instanceId,
      name: instanceConfig.project.name,
      categories: [], // Categories not needed for VALIDATE/CONDENSE steps
      context: {
        projectName: instanceConfig.project.name,
        domain: instanceConfig.project.domain || 'documentation',
        targetAudience: 'developers',
        documentationPurpose: 'technical documentation',
      },
    };

    // Convert conversation to thread format for pipeline context
    const thread: ConversationThread = {
      id: conversation.id,
      category: conversation.messages[0]?.category || 'unknown',
      messageIds: conversation.messages.map((m) => m.messageId),
      summary: conversation.summary,
      docValueReason: conversation.messages[0]?.docValueReason || '',
      ragSearchCriteria: conversation.messages[0]?.ragSearchCriteria || {
        keywords: [],
        semanticQuery: '',
      },
    };

    // Convert proposals to pipeline format
    const pipelineProposals: PipelineProposal[] = proposals.map((p) => ({
      updateType: p.updateType,
      page: p.page,
      section: p.section,
      suggestedText: p.suggestedText,
      reasoning: p.reasoning,
      sourceMessages: p.sourceMessages,
    }));

    // Create RAG service adapter (maps MessageVectorSearch to IRagService interface)
    const ragServiceAdapter = {
      searchSimilarDocs: async (query: string, topK: number) => {
        const results = await this.messageVectorSearch.searchSimilarDocs(query, topK);
        return results.map((r) => ({
          id: r.id,
          filePath: r.file_path,
          title: r.title,
          content: r.content,
          similarity: r.distance,
        }));
      },
    };

    // Create a minimal pipeline context for post-processing
    const context = createPipelineContext({
      instanceId: this.instanceId,
      batchId,
      streamId: conversation.id,
      messages: [], // Not needed for post-processing
      contextMessages: [],
      domainConfig,
      prompts: this.promptRegistry,
      llmHandler: this.llmHandler,
      ragService: ragServiceAdapter,
      db: this.db,
    });

    // Add thread and proposals to context
    context.threads = [thread];
    context.proposals.set(conversation.id, pipelineProposals);

    // Create orchestrator with only post-processing steps
    const postProcessConfig: PipelineConfig = {
      ...this.pipelineConfig,
      steps: this.pipelineConfig.steps.filter(
        (s) => (s.stepType === StepType.VALIDATE || s.stepType === StepType.CONDENSE) && s.enabled
      ),
    };

    if (postProcessConfig.steps.length === 0) {
      return proposals;
    }

    try {
      const orchestrator = new PipelineOrchestrator(postProcessConfig, this.llmHandler);
      const result = await orchestrator.execute(context);

      if (!result.success) {
        logger.warn(`Pipeline post-processing had errors for ${conversation.id}`, {
          errors: result.errors.map((e) => e.message),
        });
      }

      // Extract processed proposals back
      const processedProposals = context.proposals.get(conversation.id) || [];

      // Convert back to ProposalGeneration format
      return processedProposals.map((p) => ({
        updateType: p.updateType,
        page: p.page,
        section: p.section,
        suggestedText: p.suggestedText,
        reasoning: p.reasoning,
        sourceMessages: p.sourceMessages,
        warnings: p.warnings,
      }));
    } catch (error) {
      logger.error(`Pipeline post-processing failed for ${conversation.id}:`, error);
      return proposals; // Return original proposals on error
    }
  }

  /**
   * Check if batch processing is currently running
   */
  static getProcessingStatus(): boolean {
    return BatchMessageProcessor.isProcessing;
  }

  /**
   * Process the next batch of messages
   * @param options.streamIdFilter - Optional: only process messages from this stream
   * Returns number of messages processed
   */
  async processBatch(options?: { streamIdFilter?: string }): Promise<number> {
    // Check if already processing
    if (BatchMessageProcessor.isProcessing) {
      logger.warn('Already processing, skipping...');
      return 0;
    }

    // Set processing flag
    BatchMessageProcessor.isProcessing = true;
    const filterMsg = options?.streamIdFilter
      ? ` (filtered to stream: ${options.streamIdFilter})`
      : '';
    logger.info(`Starting batch processing...${filterMsg}`);

    // Initialize pipeline components (loads config from S3 if enabled)
    await this.initializePipeline();

    try {
      let totalMessagesProcessedAcrossAllBatches = 0;
      let batchNumber = 0;

      // Build where clause with optional stream filter
      // By default, exclude test stream ('pipeline-test') from production runs
      const whereClause: { processingStatus: 'PENDING'; streamId?: string | { not: string } } = {
        processingStatus: 'PENDING',
      };
      if (options?.streamIdFilter) {
        // Specific stream filter (e.g., for test runs)
        whereClause.streamId = options.streamIdFilter;
      } else {
        // Production: exclude test stream
        whereClause.streamId = { not: 'pipeline-test' };
      }

      // Get all distinct streams with pending messages
      const allStreams = await this.db.unifiedMessage.findMany({
        where: whereClause,
        distinct: ['streamId'],
        select: { streamId: true },
      });

      if (allStreams.length === 0) {
        logger.debug('No pending messages found across any streams.');
        return 0;
      }

      logger.info(`Found ${allStreams.length} streams with pending messages`);

      // Process each stream independently
      for (const { streamId } of allStreams) {
        logger.info(`Processing stream: ${streamId}`);

        // Process batches for this stream until no more pending messages
        while (true) {
          batchNumber++;

          // 1. Get processing watermark for this stream
          const watermark = await this.getProcessingWatermark(streamId);
          logger.debug(`Stream ${streamId} watermark: ${watermark.toISOString()}`);

          // 2. Find the earliest unprocessed message for this stream after its watermark
          const earliestUnprocessed = await this.db.unifiedMessage.findFirst({
            where: {
              streamId,
              timestamp: { gte: watermark },
              processingStatus: 'PENDING',
            },
            orderBy: { timestamp: 'asc' },
            select: { timestamp: true },
          });

          if (!earliestUnprocessed) {
            logger.debug(`Stream ${streamId}: No more unprocessed messages.`);
            break;
          }

          logger.debug(
            `Stream ${streamId}: Earliest unprocessed at ${earliestUnprocessed.timestamp.toISOString()}`
          );

          // 3. Calculate batch window for this stream
          const batchStart = earliestUnprocessed.timestamp;
          const idealBatchEnd = new Date(
            batchStart.getTime() + this.config.batchWindowHours * 60 * 60 * 1000
          );
          const now = new Date();
          const batchEnd = idealBatchEnd < now ? idealBatchEnd : now;

          logger.debug(
            `Stream ${streamId} batch window: ${batchStart.toISOString()} to ${batchEnd.toISOString()}`
          );

          // Check if there are any messages in this window for this stream
          const messageCount = await this.db.unifiedMessage.count({
            where: {
              streamId,
              timestamp: { gte: batchStart, lt: batchEnd },
              processingStatus: 'PENDING',
            },
          });

          if (messageCount === 0) {
            logger.debug(
              `Stream ${streamId}: No pending messages in batch window, moving watermark forward`
            );
            await this.updateProcessingWatermark(streamId, batchEnd);
            continue;
          }

          logger.info(`Stream ${streamId}: Found ${messageCount} pending messages`);

          // Use timestamps instead of ISO strings to keep batch_id under 50 chars
          const batchId = `${streamId.substring(0, 10)}_${batchStart.getTime()}`;

          // Fetch context messages for this stream batch
          const contextStart = new Date(
            batchStart.getTime() - this.config.contextWindowHours * 60 * 60 * 1000
          );
          const contextMessages = await this.fetchContextMessages(
            contextStart,
            batchStart,
            streamId
          );
          logger.debug(`Stream ${streamId}: Fetched ${contextMessages.length} context messages`);

          // Process messages in chunks until this batch window is exhausted
          let totalMessagesProcessed = 0;
          let totalConversationsProcessed = 0;
          let totalProposalsGenerated = 0;
          let anyMessagesFailed = false;
          let iteration = 0;
          void batchNumber; // Used for logging context

          while (true) {
            iteration++;
            logger.debug(`Stream ${streamId} - Iteration ${iteration}: Fetching next chunk...`);

            // Fetch next chunk of messages for batch (up to maxBatchSize) from this stream
            const messages = await this.fetchMessagesForBatch(batchStart, batchEnd, streamId);
            logger.debug(
              `Stream ${streamId} - Iteration ${iteration}: Fetched ${messages.length} messages`
            );

            if (messages.length === 0) {
              // No more messages in this batch window
              break;
            }

            // 5. Perform batch classification (LLM groups messages into threads)
            const classification = await this.classifyBatch(messages, contextMessages, batchId);
            const valuableThreads = classification.threads.filter(
              (t) => t.category !== 'no-doc-value'
            );
            const noValueThreads = classification.threads.filter(
              (t) => t.category === 'no-doc-value'
            );
            logger.info(
              `Iteration ${iteration}: Classified ${classification.threads.length} threads (${valuableThreads.length} valuable, ${noValueThreads.length} no-value)`
            );

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
            logger.info(
              `Iteration ${iteration}: Created ${valuableConversations.length} valuable and ${noValueConversations.length} no-value conversation groups`
            );

            // 7. Store classification results for ALL threads (valuable + no-value)
            await this.storeClassificationResults(
              classification.threads,
              batchId,
              allConversations,
              messages
            );

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
                conversation.messages.forEach((msg) =>
                  successfullyProcessedMessageIds.add(msg.messageId)
                );
              } catch (error) {
                logger.error(`Error processing conversation ${conversation.id}:`, error);
                logger.warn(`Conversation will remain unprocessed and retry on next batch run`);
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
                conversation.messages.forEach((msg) =>
                  successfullyProcessedMessageIds.add(msg.messageId)
                );
              } catch (error) {
                logger.error(`Error processing no-value conversation ${conversation.id}:`, error);
                logger.warn(`Conversation will remain unprocessed and retry on next batch run`);
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
              logger.info(`Marked ${successfullyProcessedMessageIds.size} messages as COMPLETED`);
            }

            // 10. Clean up classification data for failed messages so they can be re-classified on retry
            const failedMessageIds = messages
              .map((m) => m.id)
              .filter((id) => !successfullyProcessedMessageIds.has(id));

            if (failedMessageIds.length > 0) {
              await this.db.messageClassification.deleteMany({
                where: { messageId: { in: failedMessageIds } },
              });
              anyMessagesFailed = true;
              logger.warn(
                `${failedMessageIds.length} messages remain unprocessed due to errors and will retry (classifications cleaned up)`
              );
            }

            totalMessagesProcessed += successfullyProcessedMessageIds.size;
            totalProposalsGenerated += iterationProposals;
            logger.info(
              `Stream ${streamId} - Iteration ${iteration} complete: ${successfullyProcessedMessageIds.size}/${messages.length} messages successfully processed, ${allConversations.length} conversations (${valuableConversations.length} valuable, ${noValueConversations.length} no-value), ${iterationProposals} proposals`
            );
          }

          // Update stream watermark only if ALL messages in this batch succeeded
          if (!anyMessagesFailed) {
            await this.updateProcessingWatermark(streamId, batchEnd);
            logger.info(
              `Stream ${streamId} batch complete: ${totalMessagesProcessed} messages, ${totalConversationsProcessed} conversations, ${totalProposalsGenerated} proposals. Watermark updated to ${batchEnd.toISOString()}`
            );
          } else {
            logger.warn(
              `Stream ${streamId} batch complete with failures: ${totalMessagesProcessed} messages succeeded, ${totalConversationsProcessed} conversations, ${totalProposalsGenerated} proposals. Watermark NOT updated - failed messages will retry on next run.`
            );
          }

          // Accumulate totals across all batches
          totalMessagesProcessedAcrossAllBatches += totalMessagesProcessed;
        }

        logger.info(`Stream ${streamId} processing complete`);
      }

      // All batches processed
      logger.info('All batches complete');
      logger.info(`Total across all batches: ${totalMessagesProcessedAcrossAllBatches} messages`);
      return totalMessagesProcessedAcrossAllBatches;
    } finally {
      // Always clear processing flag
      BatchMessageProcessor.isProcessing = false;
      logger.debug('Processing flag cleared');
    }
  }

  /**
   * Get current processing watermark for a specific stream
   */
  private async getProcessingWatermark(streamId: string): Promise<Date> {
    const watermark = await this.db.processingWatermark.findUnique({
      where: { streamId },
    });

    if (!watermark) {
      // Initialize watermark to earliest message in this stream, or 7 days ago if no messages
      const earliestMessage = await this.db.unifiedMessage.findFirst({
        where: { streamId },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      });

      const initialWatermark =
        earliestMessage?.timestamp || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      await this.db.processingWatermark.create({
        data: {
          streamId,
          watermarkTime: initialWatermark,
        },
      });
      return initialWatermark;
    }

    return watermark.watermarkTime;
  }

  /**
   * Update processing watermark for a specific stream
   */
  private async updateProcessingWatermark(streamId: string, newTime: Date): Promise<void> {
    await this.db.processingWatermark.upsert({
      where: { streamId },
      update: {
        watermarkTime: newTime,
        lastProcessedBatch: new Date(),
      },
      create: {
        streamId,
        watermarkTime: newTime,
        lastProcessedBatch: new Date(),
      },
    });
  }

  /**
   * Fetch messages for batch window (only PENDING messages)
   */
  private async fetchMessagesForBatch(start: Date, end: Date, streamId?: string): Promise<any[]> {
    return await this.db.unifiedMessage.findMany({
      where: {
        ...(streamId && { streamId }), // Filter by stream if provided
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
  private async fetchContextMessages(start: Date, end: Date, streamId?: string): Promise<any[]> {
    return await this.db.unifiedMessage.findMany({
      where: {
        ...(streamId && { streamId }), // Filter by stream if provided
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
  private buildReplyChainMap(
    messages: any[]
  ): Map<string, { replyToId: string | null; depth: number }> {
    const chainMap = new Map<string, { replyToId: string | null; depth: number }>();

    // Create lookup by composite messageId ("{chatId}-{messageId}")
    const messageIdSet = new Set(messages.map((m) => m.messageId));

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
            depth: 0, // Will be calculated in second pass
          });
        }
      }

      // Non-reply messages or replies to messages outside batch
      if (!chainMap.has(msg.messageId)) {
        chainMap.set(msg.messageId, {
          replyToId: null,
          depth: 0,
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
    _batchId: string
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
      // Include Zulip topic if present (important for grouping Zulip conversations)
      const topic = msg.metadata?.topic ? ` [Topic: ${msg.metadata.topic}]` : '';
      formatted += `${indent}[${msg.timestamp.toISOString()}] ${msg.author} in ${msg.channel || 'general'}${topic}: ${msg.content}`;

      return formatted;
    };

    const contextText = contextMessages.map(formatMessage).join('\n');
    const messagesToAnalyze = messages
      .map((msg) => {
        return `[MSG_${msg.id}] ${formatMessage(msg)}`;
      })
      .join('\n\n');

    const systemPrompt = PROMPT_TEMPLATES.threadClassification.system;

    const config = InstanceConfigLoader.get(this.instanceId);
    const userPrompt = fillTemplate(PROMPT_TEMPLATES.threadClassification.user, {
      projectName: config.project.name,
      contextText: contextText || '(No context messages)',
      messagesToAnalyze,
    });

    logger.debug(
      `Classifying batch: ${messages.length} messages, ${contextMessages.length} context`
    );

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

    // Create a set of valid message IDs in the current batch (to filter out context messages)
    const validMessageIds = new Set(allMessages.map((msg) => msg.id));

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
        // Skip message IDs that aren't in the current batch (e.g., context messages)
        if (!validMessageIds.has(messageId)) {
          logger.debug(`Message ${messageId} not found in batch, skipping`);
          continue;
        }
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
            ragSearchCriteria: isNoValue ? Prisma.DbNull : thread.ragSearchCriteria,
            modelUsed: this.config.classificationModel,
          },
          create: {
            messageId,
            batchId,
            conversationId, // null for no-value threads
            category: thread.category,
            docValueReason: thread.docValueReason,
            suggestedDocPage: null,
            ragSearchCriteria: isNoValue ? Prisma.DbNull : thread.ragSearchCriteria,
            modelUsed: this.config.classificationModel,
          },
        });
      }
    }

    // Safety net: Create classification records for any messages the LLM missed
    // This should rarely happen now that we instruct the LLM to classify EVERY message
    const missedMessages = allMessages.filter((msg) => !classifiedMessageIds.has(msg.id));
    if (missedMessages.length > 0) {
      logger.warn(
        `LLM missed ${missedMessages.length} messages - creating fallback classifications`
      );
      for (const message of missedMessages) {
        // Use upsert to handle retries where classification may already exist
        await this.db.messageClassification.upsert({
          where: { messageId: message.id },
          update: {
            batchId,
            conversationId: null,
            category: 'no-doc-value',
            docValueReason:
              'LLM classification error: Message was not included in any thread during batch processing',
            suggestedDocPage: null,
            ragSearchCriteria: Prisma.DbNull,
            modelUsed: this.config.classificationModel,
          },
          create: {
            messageId: message.id,
            batchId,
            conversationId: null,
            category: 'no-doc-value',
            docValueReason:
              'LLM classification error: Message was not included in any thread during batch processing',
            suggestedDocPage: null,
            ragSearchCriteria: Prisma.DbNull,
            modelUsed: this.config.classificationModel,
          },
        });
      }
    }

    logger.info(
      `Stored classifications for ${classifiedMessageIds.size} messages in conversations and ${missedMessages.length} fallback classifications`
    );
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
    _batchId: string
  ): Promise<ConversationGroup[]> {
    if (threads.length === 0) {
      return [];
    }

    const conversations: ConversationGroup[] = [];

    for (const thread of threads) {
      // Get full message details for all messages in thread
      const messageDetails = thread.messages
        .map((messageId) => {
          const msg = allMessages.find((m) => m.id === messageId);
          if (!msg) {
            logger.warn(`Message ${messageId} not found in batch, skipping`);
            return null;
          }
          return {
            messageId: msg.id,
            timestamp: msg.timestamp,
            author: msg.author,
            content: msg.content,
            channel: msg.channel,
            metadata: msg.metadata,
            category: thread.category,
            docValueReason: thread.docValueReason,
            ragSearchCriteria: thread.ragSearchCriteria,
          };
        })
        .filter((m) => m !== null);

      if (messageDetails.length === 0) {
        logger.warn(`Thread has no valid messages, skipping`);
        continue;
      }

      // Sort messages by timestamp
      messageDetails.sort((a, b) => a!.timestamp.getTime() - b!.timestamp.getTime());

      const firstMsg = messageDetails[0]!;
      const lastMsg = messageDetails[messageDetails.length - 1]!;

      // Use channel + timestamp for conversation ID (not Zulip topic, since LLM may merge across topics)
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
  private async processConversation(
    conversation: ConversationGroup,
    batchId: string
  ): Promise<number> {
    logger.debug(
      `Processing conversation ${conversation.id} (${conversation.messageCount} messages)`
    );

    // 1. Perform RAG retrieval once for the entire conversation
    const ragDocs = await this.performConversationRAG(conversation);

    // 2. Store RAG context for the conversation
    // Truncate summary to 200 characters to fit in database VARCHAR(200)
    const truncatedSummary =
      conversation.summary.length > 200
        ? conversation.summary.substring(0, 197) + '...'
        : conversation.summary;

    // Store only metadata in retrievedDocs (remove full content to reduce JSON size)
    const ragDocsMetadata = ragDocs.map((doc) => ({
      docId: doc.docId,
      title: doc.title,
      filePath: doc.filePath,
      similarity: doc.similarity,
      contentPreview: doc.content ? doc.content.substring(0, 1000) + '...' : '', // Store 1000 char preview
    }));

    // Use upsert to handle case where RAG context already exists from a failed previous attempt
    await this.db.conversationRagContext.upsert({
      where: { conversationId: conversation.id },
      create: {
        conversationId: conversation.id,
        batchId,
        retrievedDocs: ragDocsMetadata,
        totalTokens: this.estimateTokens(ragDocs),
        summary: truncatedSummary,
      },
      update: {
        batchId,
        retrievedDocs: ragDocsMetadata,
        totalTokens: this.estimateTokens(ragDocs),
        summary: truncatedSummary,
        proposalsRejected: null,
        rejectionReason: null,
      },
    });

    // 3. Generate changeset proposals for the conversation
    const {
      proposals: rawProposals,
      proposalsRejected,
      rejectionReason,
    } = await this.generateConversationProposals(conversation, ragDocs);

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

    // 3.6. Run pipeline post-processing (VALIDATE, CONDENSE steps if enabled)
    const postProcessedProposals = await this.runPipelinePostProcessing(
      rawProposals,
      conversation,
      batchId
    );

    // 3.7. Run enrichment and ruleset review (Quality System integration)
    const ruleset = await this.loadTenantRuleset();
    const enrichedProposals = await this.runEnrichmentAndReview(
      postProcessedProposals,
      conversation,
      ragDocs,
      ruleset
    );

    // 3.8. Filter out rejected proposals (but count them)
    const acceptedProposals = enrichedProposals.filter((p) => !p.reviewResult?.rejected);
    const rejectedByRuleset = enrichedProposals.filter((p) => p.reviewResult?.rejected);

    if (rejectedByRuleset.length > 0) {
      logger.info(
        `Ruleset rejected ${rejectedByRuleset.length}/${enrichedProposals.length} proposals for conversation ${conversation.id}`
      );
    }

    // 4. Store proposals (multiple proposals per conversation)
    // NOTE: Store ALL proposals including NONE type to capture LLM reasoning
    // Skip proposals rejected by ruleset
    let proposalCount = 0;
    for (const proposal of acceptedProposals) {
      // Post-process the suggested text to fix markdown formatting issues
      const textToProcess = proposal.reviewResult?.modifiedContent || proposal.suggestedText;
      const postProcessed = postProcessProposal(textToProcess, proposal.page);

      if (postProcessed.wasModified) {
        logger.debug(`Post-processed proposal for ${proposal.page} (content modified)`);
      }

      // Build quality flags from review result
      const qualityWarnings = [
        ...(proposal.warnings || []),
        ...(postProcessed.warnings || []),
        ...(proposal.reviewResult?.qualityFlags || []),
      ];

      const createdProposal = await this.db.docProposal.create({
        data: {
          conversationId: conversation.id,
          batchId,
          page: proposal.page,
          updateType: proposal.updateType,
          section: proposal.section || null,
          location: proposal.location ?? Prisma.DbNull,
          suggestedText: postProcessed.text || textToProcess || null,
          rawSuggestedText: proposal.suggestedText || null, // Original LLM output before post-processing
          reasoning: proposal.reasoning || null,
          sourceMessages: proposal.sourceMessages ?? Prisma.DbNull,
          modelUsed: this.config.proposalModel,
          warnings: qualityWarnings.length > 0 ? qualityWarnings : Prisma.DbNull,
          // Quality System fields
          enrichment: proposal.enrichment
            ? (proposal.enrichment as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });

      // Create ProposalReviewLog if ruleset was applied
      if (proposal.reviewResult && this.rulesetUpdatedAt) {
        try {
          await this.db.proposalReviewLog.create({
            data: {
              proposalId: createdProposal.id,
              rulesetVersion: this.rulesetUpdatedAt,
              originalContent: proposal.reviewResult.originalContent || null,
              modificationsApplied:
                proposal.reviewResult.modificationsApplied.length > 0
                  ? proposal.reviewResult.modificationsApplied
                  : Prisma.DbNull,
              rejected: false, // Accepted proposals only (rejected ones are filtered out above)
              qualityFlags:
                proposal.reviewResult.qualityFlags.length > 0
                  ? proposal.reviewResult.qualityFlags
                  : Prisma.DbNull,
            },
          });
        } catch (reviewLogError) {
          logger.warn(
            `Failed to create ProposalReviewLog for proposal ${createdProposal.id}:`,
            reviewLogError
          );
        }
      }

      proposalCount++;
    }

    // Note: Messages are marked as COMPLETED earlier in processBatch() after classification
    const rejectionMsg = proposalsRejected ? ` (Rejected: ${rejectionReason})` : '';
    logger.info(
      `Conversation ${conversation.id} complete. Generated ${proposalCount} proposals${rejectionMsg}`
    );
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
    const truncatedSummary =
      conversation.summary.length > 200
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
        rejectionReason:
          conversation.messages[0]?.docValueReason || 'Classified as no documentation value',
      },
    });

    logger.debug(
      `No-value conversation ${conversation.id} marked as discarded: ${conversation.messages[0]?.docValueReason}`
    );
  }

  /**
   * Perform RAG retrieval for an entire conversation
   * Combines all messages in conversation to build comprehensive search query
   */
  private async performConversationRAG(conversation: ConversationGroup): Promise<any[]> {
    // Build comprehensive search query from all messages in conversation
    const allContent = conversation.messages.map((m) => m.content).join(' ');

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
    const searchQuery =
      semanticQueries.length > 0 ? semanticQueries.join(' ') : allContent.substring(0, 500); // Limit to avoid overly long queries

    logger.debug(`RAG search for conversation: "${searchQuery.substring(0, 100)}..."`);

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
        if (
          (isEnglish && existing.filePath.startsWith('i18n/')) ||
          (isEnglish === existing.filePath.startsWith('i18n/') &&
            doc.similarity > existing.similarity)
        ) {
          uniqueByBasePath.set(basePath, doc);
        }
      }
    }

    const dedupedDocs = Array.from(uniqueByBasePath.values()).slice(0, this.config.ragTopK); // Limit to original topK after deduplication

    if (results.length > dedupedDocs.length) {
      logger.debug(`RAG: ${results.length} -> ${dedupedDocs.length} docs (deduped translations)`);
    }
    return dedupedDocs;
  }

  /**
   * Generate documentation changesets for a conversation
   * Injects PROMPT_CONTEXT from tenant ruleset if available
   */
  private async generateConversationProposals(
    conversation: ConversationGroup,
    ragDocs: any[]
  ): Promise<{
    proposals: ProposalGeneration[];
    proposalsRejected?: boolean;
    rejectionReason?: string;
  }> {
    // Load tenant ruleset for PROMPT_CONTEXT injection
    const ruleset = await this.loadTenantRuleset();
    const systemPrompt = this.buildChangesetSystemPrompt(ruleset);

    const ragContext = ragDocs
      .map((doc, idx) => {
        return `[DOC ${idx + 1}] ${doc.title}
File Path: ${doc.filePath}
Similarity: ${doc.similarity.toFixed(3)}
Length: ${doc.content.length} chars

COMPLETE FILE CONTENT:
${doc.content}`;
      })
      .join('\n\n========================================\n\n');

    // Format conversation messages
    const conversationContext = conversation.messages
      .map((msg, idx) => {
        return `[MESSAGE ${idx + 1}] (ID: ${msg.messageId})
Author: ${msg.author}
Time: ${msg.timestamp.toISOString()}
Category: ${msg.category}
Reason: ${msg.docValueReason}
Suggested Page: ${msg.suggestedDocPage || 'Not specified'}
Content: ${msg.content}`;
      })
      .join('\n\n');

    const config = InstanceConfigLoader.get(this.instanceId);
    const userPrompt = fillTemplate(PROMPT_TEMPLATES.changesetGeneration.user, {
      projectName: config.project.name,
      messageCount: conversation.messageCount,
      channel: conversation.channel || 'general',
      conversationContext,
      ragContext: ragContext || '(No relevant docs found)',
    });

    logger.debug(`Generating changeset for conversation ${conversation.id}`);

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

    logger.info(`Conversation ${conversation.id}: LLM proposed ${data.proposals.length} changes`);

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
