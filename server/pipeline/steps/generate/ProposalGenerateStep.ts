/**
 * Proposal Generate Step
 *
 * Generates documentation change proposals using LLM.
 * Creates INSERT, UPDATE, or DELETE proposals based on thread analysis.
 *
 * @author Wayne
 * @created 2025-12-30
 */

import { z } from 'zod';
import { BasePipelineStep } from '../base/BasePipelineStep.js';
import {
  StepType,
  type StepConfig,
  type StepMetadata,
  type PipelineContext,
  type ConversationThread,
  type RagDocument,
  type Proposal,
  type ILLMHandler,
} from '../../core/interfaces.js';

/**
 * Configuration for ProposalGenerateStep
 */
interface ProposalGenerateConfig {
  promptId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxProposalsPerThread?: number;
}

/**
 * LLM response schema for proposal generation
 */
const ProposalResponseSchema = z.object({
  proposals: z.array(
    z.object({
      updateType: z.enum(['INSERT', 'UPDATE', 'DELETE', 'NONE']),
      page: z.string(),
      section: z.string().optional(),
      suggestedText: z.string().optional(),
      reasoning: z.string(),
      sourceMessages: z.array(z.number()).optional(),
    })
  ),
  proposalsRejected: z.boolean().optional(),
  rejectionReason: z.string().optional(),
});

type ProposalResponse = z.infer<typeof ProposalResponseSchema>;

/**
 * Generates documentation change proposals using LLM
 */
export class ProposalGenerateStep extends BasePipelineStep {
  readonly stepType = StepType.GENERATE;

  private promptId: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private maxProposalsPerThread: number;

  constructor(config: StepConfig, llmHandler: ILLMHandler) {
    super(config, llmHandler);

    const generateConfig = config.config as ProposalGenerateConfig;
    this.promptId = generateConfig.promptId || 'changeset-generation';
    this.model = generateConfig.model || 'gemini-2.5-pro';
    this.temperature = generateConfig.temperature ?? 0.4;
    this.maxTokens = generateConfig.maxTokens ?? 32768;
    this.maxProposalsPerThread = generateConfig.maxProposalsPerThread || 5;
  }

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const startTime = Date.now();
    const llmHandler = this.requireLLMHandler();

    // Only process threads with RAG context
    const threadsWithRag = context.threads.filter(
      (t) => context.ragResults.has(t.id) && context.ragResults.get(t.id)!.length > 0
    );

    if (threadsWithRag.length === 0) {
      this.logger.info('No threads with RAG context, skipping proposal generation');
      this.recordTiming(context, startTime);
      return context;
    }

    this.logger.info(`Generating proposals for ${threadsWithRag.length} threads`);

    let totalProposals = 0;
    const maxBatchProposals = context.domainConfig.security?.maxProposalsPerBatch || 100;

    for (const thread of threadsWithRag) {
      // Check if we've hit the batch limit
      if (totalProposals >= maxBatchProposals) {
        this.logger.warn(`Reached max proposals per batch (${maxBatchProposals}), stopping`);
        break;
      }

      try {
        const ragDocs = context.ragResults.get(thread.id) || [];
        const proposals = await this.generateProposalsForThread(
          context,
          thread,
          ragDocs,
          llmHandler
        );

        // Apply security filtering
        const filteredProposals = this.applySecurityFilters(proposals, context);

        // Limit proposals per thread
        const limitedProposals = filteredProposals.slice(0, this.maxProposalsPerThread);

        context.proposals.set(thread.id, limitedProposals);
        totalProposals += limitedProposals.length;

        this.logger.debug(`Thread ${thread.id}: generated ${limitedProposals.length} proposals`);
      } catch (error) {
        this.logger.error(`Failed to generate proposals for thread ${thread.id}:`, error);
        context.proposals.set(thread.id, []);
      }
    }

    this.recordTiming(context, startTime);

    this.logger.info(`Proposal generation complete: ${totalProposals} proposals`);

    return context;
  }

  /**
   * Generate proposals for a single thread
   */
  private async generateProposalsForThread(
    context: PipelineContext,
    thread: ConversationThread,
    ragDocs: RagDocument[],
    llmHandler: ILLMHandler
  ): Promise<Proposal[]> {
    // Render the prompt template
    const rendered = context.prompts.render(this.promptId, {
      projectName: context.domainConfig.context.projectName,
      domain: context.domainConfig.context.domain,
      targetAudience: context.domainConfig.context.targetAudience,
      documentationPurpose: context.domainConfig.context.documentationPurpose,
      threadSummary: thread.summary,
      threadCategory: thread.category,
      docValueReason: thread.docValueReason,
      ragContext: this.formatRagDocs(ragDocs),
      messages: this.formatThreadMessages(thread, context),
    });

    // Call LLM for proposal generation
    const { data, response } = await llmHandler.requestJSON<ProposalResponse>(
      {
        model: this.model,
        systemPrompt: rendered.system,
        userPrompt: rendered.user,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      },
      ProposalResponseSchema,
      {
        instanceId: context.instanceId,
        batchId: context.batchId,
        conversationId: thread.id,
        purpose: 'proposal',
      }
    );

    // Update metrics
    context.metrics.llmCalls++;
    if (response.tokensUsed) {
      context.metrics.llmTokensUsed += response.tokensUsed;
    }

    // Handle rejection
    if (data.proposalsRejected) {
      this.logger.debug(`Thread ${thread.id}: proposals rejected - ${data.rejectionReason}`);
      return [];
    }

    // Filter out NONE proposals
    return data.proposals
      .filter((p) => p.updateType !== 'NONE')
      .map((p) => ({
        updateType: p.updateType,
        page: p.page,
        section: p.section,
        suggestedText: p.suggestedText,
        reasoning: p.reasoning,
        sourceMessages: p.sourceMessages,
      }));
  }

  /**
   * Format RAG documents for prompt injection
   */
  private formatRagDocs(docs: RagDocument[]): string {
    if (docs.length === 0) {
      return '(No relevant documentation found)';
    }

    return docs
      .map(
        (doc, idx) =>
          `[DOC ${idx + 1}] ${doc.title}\nPath: ${doc.filePath}\nSimilarity: ${doc.similarity.toFixed(3)}\n\n${doc.content}`
      )
      .join('\n\n---\n\n');
  }

  /**
   * Format thread messages for prompt injection
   */
  private formatThreadMessages(thread: ConversationThread, context: PipelineContext): string {
    // Find messages by their index in the filtered messages array
    const messages = thread.messageIds.map((idx) => context.filteredMessages[idx]).filter(Boolean);

    if (messages.length === 0) {
      return '(No messages)';
    }

    return messages
      .map((m) => `[${m.id}] [${m.timestamp.toISOString()}] ${m.author}: ${m.content}`)
      .join('\n\n');
  }

  /**
   * Apply security filters to proposals
   */
  private applySecurityFilters(proposals: Proposal[], context: PipelineContext): Proposal[] {
    const blockPatterns = context.domainConfig.security?.blockPatterns || [];

    if (blockPatterns.length === 0) {
      return proposals;
    }

    return proposals.map((proposal) => {
      const warnings: string[] = [];

      for (const pattern of blockPatterns) {
        const regex = new RegExp(pattern, 'gi');
        if (proposal.suggestedText && regex.test(proposal.suggestedText)) {
          warnings.push(`Blocked pattern detected: ${pattern}`);
        }
      }

      if (warnings.length > 0) {
        return { ...proposal, warnings };
      }

      return proposal;
    });
  }

  validateConfig(config: StepConfig): boolean {
    if (!super.validateConfig(config)) {
      return false;
    }

    const generateConfig = config.config as ProposalGenerateConfig;

    // Validate model
    if (generateConfig.model && typeof generateConfig.model !== 'string') {
      this.logger.error('model must be a string');
      return false;
    }

    // Validate temperature
    if (
      generateConfig.temperature !== undefined &&
      (generateConfig.temperature < 0 || generateConfig.temperature > 2)
    ) {
      this.logger.error('temperature must be between 0 and 2');
      return false;
    }

    // Validate maxProposalsPerThread
    if (
      generateConfig.maxProposalsPerThread !== undefined &&
      (typeof generateConfig.maxProposalsPerThread !== 'number' ||
        generateConfig.maxProposalsPerThread < 1)
    ) {
      this.logger.error('maxProposalsPerThread must be a positive number');
      return false;
    }

    return true;
  }

  getMetadata(): StepMetadata {
    return {
      name: 'Proposal Generator',
      description: 'Generates documentation change proposals using LLM',
      version: '1.0.0',
      author: 'Wayne',
    };
  }
}

/**
 * Factory function for ProposalGenerateStep
 */
export function createProposalGenerateStep(
  config: StepConfig,
  llmHandler: ILLMHandler
): ProposalGenerateStep {
  return new ProposalGenerateStep(config, llmHandler);
}
