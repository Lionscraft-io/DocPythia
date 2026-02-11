# Customizable Analysis Pipeline - Technical Specification

**Spec ID:** customizable-analysis-pipeline
**Created by:** System
**Date:** 2025-12-30
**Status:** Draft
**Related Story:** N/A (Architectural improvement)
**Related PRD:** N/A

## 1. Overview

This specification defines the transformation of the hardcoded conversation analysis pipeline into a fully configurable, domain-agnostic system. The current implementation has prompts, classification logic, and LLM interactions tightly coupled within `batch-message-processor.ts` and `prompt-templates.ts`. This refactoring externalizes all configuration, introduces interface-based pipeline steps, and enables per-instance customization without code changes.

**Technical Goals:**
- Zero code changes required to customize analysis behavior
- Hot-reload capability for prompts and configuration
- Plugin-based pipeline architecture with composable steps
- Domain-agnostic core with instance-specific configuration
- Backward compatibility with existing Pythia instances

**Constraints:**
- Must maintain existing database schema
- Cannot break current batch processing workflow
- Must preserve RAG integration and vector search
- Performance must not degrade significantly

**Business Context:**
The immediate use case is focusing a Pythia instance exclusively on specific operations (e.g., validator operations), filtering out irrelevant questions. Future instances may have different domain focuses (e.g., DeFi protocols, developer tools). Each instance needs unique classification categories, filtering rules, and prompt templates without duplicating core pipeline code.

## 2. Technical Approach

### High-Level Architecture

The system is restructured into four layers:

1. **Configuration Layer**: Prompt templates, domain definitions, pipeline assembly
2. **Pipeline Layer**: Interface-based steps that execute in sequence
3. **Execution Layer**: Step orchestrator with context passing and error handling
4. **Integration Layer**: LLM handlers, RAG services, database persistence

```
┌─────────────────────────────────────────────────────────────┐
│                   Configuration Layer                        │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Prompt Files  │  │ Domain Defs  │  │ Pipeline Config │  │
│  │ (Markdown)    │  │ (JSON)       │  │ (JSON)          │  │
│  └───────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Filter   │→ │ Classify │→ │ Enrich   │→ │ Generate │   │
│  │ Step     │  │ Step     │  │ Step     │  │ Step     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Execution Layer                            │
│              PipelineOrchestrator + Context                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Integration Layer                           │
│    LLM Handlers  │  RAG Service  │  Database Persistence     │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Decision 1: Prompt Storage Format**
- **Choice:** Markdown files with YAML frontmatter
- **Rationale:** Human-readable, version control friendly, supports metadata, easy hot-reload
- **Alternative Rejected:** Database storage (requires migration tooling, harder to version)

**Decision 2: Pipeline Step Interface**
- **Choice:** Async interface with `execute(context: PipelineContext): Promise<PipelineContext>`
- **Rationale:** Allows chaining, supports async LLM calls, enables context mutation
- **Alternative Rejected:** Immutable context (excessive memory overhead for large batches)

**Decision 3: LLM Handler Injection**
- **Choice:** Dependency injection via constructor/factory
- **Rationale:** Testability, swappable implementations, no tight coupling
- **Alternative Rejected:** Global singleton (hard to test, limits flexibility)

**Decision 4: Configuration Hierarchy**
- **Choice:** Defaults → Instance overrides → Environment variables
- **Rationale:** Matches existing `InstanceConfigLoader` pattern, familiar to team
- **Alternative Rejected:** Flat single-source (no fallback, breaks backward compatibility)

### Patterns and Conventions

- **Factory Pattern:** For creating pipeline steps from configuration
- **Strategy Pattern:** For swappable LLM handlers
- **Template Method Pattern:** For prompt rendering with variable interpolation
- **Observer Pattern:** For configuration hot-reload notifications
- **Repository Pattern:** For prompt template storage/retrieval

## 3. Data Model Changes

### Schema Changes

**No database schema changes required.** The existing `MessageClassification`, `ConversationRagContext`, and `DocProposal` tables already support flexible category values and JSON metadata.

**Configuration Schema Addition (not in database):**

New configuration files will be validated against Zod schemas but stored in filesystem/S3, not PostgreSQL.

### Data Flow

```
Messages → FilterStep → ClassifyStep → EnrichStep → GenerateStep → Database
            ↓              ↓              ↓              ↓
         Keyword       LLM Call       RAG Query      LLM Call
         Matching      (classify)     (docs)         (proposals)
```

**Pipeline Context Structure:**

```typescript
interface PipelineContext {
  // Input data
  messages: UnifiedMessage[];
  contextMessages: UnifiedMessage[];
  batchId: string;
  streamId: string;
  instanceId: string;

  // Configuration
  domainConfig: DomainConfig;
  prompts: PromptRegistry;

  // Intermediate state (mutated by steps)
  filteredMessages: UnifiedMessage[];
  threads: ConversationThread[];
  ragResults: Map<string, RagDocument[]>;
  proposals: Map<string, Proposal[]>;

  // Services (injected)
  llmHandler: ILLMHandler;
  ragService: MessageVectorSearch;
  db: PrismaClient;

  // Metadata
  metrics: PipelineMetrics;
  errors: PipelineError[];
}
```

### Validation Rules

**Prompt Template Validation (Zod):**

```typescript
const PromptTemplateSchema = z.object({
  id: z.string(),
  version: z.string(),
  metadata: z.object({
    author: z.string().optional(),
    description: z.string(),
    requiredVariables: z.array(z.string()),
    tags: z.array(z.string()).optional(),
  }),
  system: z.string().min(1),
  user: z.string().min(1),
});
```

**Domain Configuration Validation (Zod):**

```typescript
const DomainConfigSchema = z.object({
  domainId: z.string(),
  name: z.string(),
  categories: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    priority: z.number().min(0).max(100),
  })),
  keywords: z.object({
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }).optional(),
  ragPaths: z.object({
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }).optional(),
  security: z.object({
    blockPatterns: z.array(z.string()).optional(),
    requireApproval: z.boolean().optional(),
  }).optional(),
});
```

## 4. API/Interface Design

### Core Interfaces

**IPipelineStep Interface:**

```typescript
/**
 * Base interface for all pipeline steps
 */
interface IPipelineStep {
  /**
   * Unique identifier for this step
   */
  readonly stepId: string;

  /**
   * Step type for factory instantiation
   */
  readonly stepType: StepType;

  /**
   * Execute this step with the given context
   * @param context - Shared pipeline context
   * @returns Updated context (may mutate in-place)
   */
  execute(context: PipelineContext): Promise<PipelineContext>;

  /**
   * Validate step configuration
   * @param config - Step-specific configuration
   */
  validateConfig(config: StepConfig): boolean;

  /**
   * Get step metadata for logging/debugging
   */
  getMetadata(): StepMetadata;
}

enum StepType {
  FILTER = 'filter',
  CLASSIFY = 'classify',
  ENRICH = 'enrich',
  GENERATE = 'generate',
  TRANSFORM = 'transform',
}

interface StepConfig {
  stepId: string;
  stepType: StepType;
  enabled: boolean;
  config: Record<string, any>;
}

interface StepMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
}
```

**ILLMHandler Interface:**

```typescript
/**
 * Interface for LLM provider abstraction
 */
interface ILLMHandler {
  /**
   * Generate structured JSON response
   */
  requestJSON<T>(
    request: LLMRequest,
    responseSchema: z.ZodSchema<T>,
    context: LLMContext
  ): Promise<{ data: T; response: LLMResponse }>;

  /**
   * Generate text response
   */
  requestText(
    request: LLMRequest,
    context: LLMContext
  ): Promise<LLMResponse>;

  /**
   * Get model capabilities
   */
  getModelInfo(model: string): ModelInfo;

  /**
   * Estimate cost for request
   */
  estimateCost(request: LLMRequest): CostEstimate;
}

interface LLMRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  history?: ConversationMessage[];
}

interface LLMContext {
  instanceId: string;
  batchId?: string;
  conversationId?: string;
  purpose: string; // e.g., 'classification', 'proposal'
}

interface ModelInfo {
  provider: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
}

interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
}
```

**IPromptRegistry Interface:**

```typescript
/**
 * Interface for prompt template storage and retrieval
 */
interface IPromptRegistry {
  /**
   * Get prompt template by ID
   */
  get(promptId: string): PromptTemplate | null;

  /**
   * Get rendered prompt with variables filled
   */
  render(promptId: string, variables: Record<string, any>): RenderedPrompt;

  /**
   * List all available prompts
   */
  list(): PromptTemplate[];

  /**
   * Reload prompts from storage (hot-reload)
   */
  reload(): Promise<void>;

  /**
   * Validate prompt template
   */
  validate(template: PromptTemplate): ValidationResult;
}

interface PromptTemplate {
  id: string;
  version: string;
  metadata: PromptMetadata;
  system: string;
  user: string;
}

interface PromptMetadata {
  author?: string;
  description: string;
  requiredVariables: string[];
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

interface RenderedPrompt {
  system: string;
  user: string;
  variables: Record<string, any>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

**IDomainConfig Interface:**

```typescript
/**
 * Domain-specific configuration
 */
interface IDomainConfig {
  domainId: string;
  name: string;
  description?: string;

  /**
   * Classification categories for this domain
   */
  categories: CategoryDefinition[];

  /**
   * Keyword-based pre-filtering
   */
  keywords?: KeywordFilter;

  /**
   * RAG document path filtering
   */
  ragPaths?: PathFilter;

  /**
   * Security rules
   */
  security?: SecurityConfig;

  /**
   * Domain context injected into prompts
   */
  context: {
    projectName: string;
    domain: string;
    targetAudience: string;
    documentationPurpose: string;
  };
}

interface CategoryDefinition {
  id: string;
  label: string;
  description: string;
  priority: number; // 0-100, higher = more important
  examples?: string[];
}

interface KeywordFilter {
  include?: string[]; // Messages must contain at least one
  exclude?: string[]; // Messages containing any are filtered out
  caseSensitive?: boolean;
}

interface PathFilter {
  include?: string[]; // Glob patterns for RAG docs to include
  exclude?: string[]; // Glob patterns for RAG docs to exclude
}

interface SecurityConfig {
  blockPatterns?: string[]; // Regex patterns to block
  requireApproval?: boolean; // All proposals require manual approval
  maxProposalsPerBatch?: number;
}
```

**IPipelineOrchestrator Interface:**

```typescript
/**
 * Orchestrates pipeline execution
 */
interface IPipelineOrchestrator {
  /**
   * Execute pipeline with given context
   */
  execute(context: PipelineContext): Promise<PipelineResult>;

  /**
   * Get pipeline configuration
   */
  getConfig(): PipelineConfig;

  /**
   * Register custom step
   */
  registerStep(stepType: string, factory: StepFactory): void;

  /**
   * Get execution metrics
   */
  getMetrics(): PipelineMetrics;
}

interface PipelineConfig {
  instanceId: string;
  steps: StepConfig[];
  errorHandling: ErrorHandlingConfig;
  performance: PerformanceConfig;
}

interface StepFactory {
  create(config: StepConfig): IPipelineStep;
}

interface ErrorHandlingConfig {
  stopOnError: boolean;
  retryAttempts: number;
  retryDelayMs: number;
}

interface PerformanceConfig {
  maxConcurrentSteps: number;
  timeoutMs: number;
  enableCaching: boolean;
}

interface PipelineResult {
  success: boolean;
  messagesProcessed: number;
  threadsCreated: number;
  proposalsGenerated: number;
  errors: PipelineError[];
  metrics: PipelineMetrics;
}

interface PipelineMetrics {
  totalDurationMs: number;
  stepDurations: Map<string, number>;
  llmCalls: number;
  llmTokensUsed: number;
  llmCostUSD: number;
  cacheHits: number;
  cacheMisses: number;
}

interface PipelineError {
  stepId: string;
  message: string;
  error: Error;
  context: Record<string, any>;
}
```

## 5. Implementation Details

### Backend

**Directory Structure:**

```
server/
├── pipeline/
│   ├── core/
│   │   ├── PipelineOrchestrator.ts      # Main orchestrator
│   │   ├── PipelineContext.ts           # Context definition
│   │   ├── StepFactory.ts               # Factory for creating steps
│   │   └── interfaces.ts                # All interfaces
│   ├── steps/
│   │   ├── base/
│   │   │   └── BasePipelineStep.ts      # Abstract base class
│   │   ├── filter/
│   │   │   ├── KeywordFilterStep.ts     # Pre-filter by keywords
│   │   │   └── NoValueFilterStep.ts     # Filter no-doc-value messages
│   │   ├── classify/
│   │   │   ├── BatchClassifyStep.ts     # LLM-based classification
│   │   │   └── ThreadGroupingStep.ts    # Group into conversations
│   │   ├── enrich/
│   │   │   └── RagEnrichStep.ts         # Add RAG context
│   │   └── generate/
│   │       └── ProposalGenerateStep.ts  # Generate changesets
│   ├── handlers/
│   │   ├── ILLMHandler.ts               # LLM handler interface
│   │   ├── GeminiHandler.ts             # Gemini implementation
│   │   ├── OpenAIHandler.ts             # OpenAI implementation (future)
│   │   └── AnthropicHandler.ts          # Anthropic implementation (future)
│   ├── prompts/
│   │   ├── PromptRegistry.ts            # Prompt storage/retrieval
│   │   ├── PromptRenderer.ts            # Template variable rendering
│   │   └── PromptValidator.ts           # Validation logic
│   └── config/
│       ├── DomainConfigLoader.ts        # Load domain configs
│       └── PipelineConfigLoader.ts      # Load pipeline configs
├── stream/
│   ├── processors/
│   │   └── batch-message-processor.ts   # UPDATED: Use pipeline
│   └── llm/
│       └── llm-service.ts               # UPDATED: Implement ILLMHandler

config/
├── defaults/
│   ├── prompts/
│   │   ├── thread-classification.md     # Default classification prompt
│   │   ├── changeset-generation.md      # Default changeset prompt
│   │   └── file-consolidation.md        # Default consolidation prompt
│   ├── domains/
│   │   └── generic.json                 # Default domain config
│   └── pipelines/
│       └── default.json                 # Default pipeline config
└── {instanceId}/
    ├── prompts/
    │   └── thread-classification.md     # Instance override
    ├── domains/
    │   └── custom-domain.json           # Instance-specific domain
    └── pipelines/
        └── custom.json                  # Custom pipeline config
```

**Step Implementations:**

**KeywordFilterStep.ts:**

```typescript
import { BasePipelineStep } from '../base/BasePipelineStep';
import { PipelineContext } from '../../core/PipelineContext';
import { StepType, StepConfig } from '../../core/interfaces';

/**
 * Pre-filters messages based on keyword inclusion/exclusion
 * No LLM calls - pure text matching
 */
export class KeywordFilterStep extends BasePipelineStep {
  readonly stepType = StepType.FILTER;

  private includeKeywords: string[] = [];
  private excludeKeywords: string[] = [];
  private caseSensitive: boolean = false;

  constructor(config: StepConfig) {
    super(config);
    this.includeKeywords = config.config.includeKeywords || [];
    this.excludeKeywords = config.config.excludeKeywords || [];
    this.caseSensitive = config.config.caseSensitive || false;
  }

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const startTime = Date.now();

    context.filteredMessages = context.messages.filter(msg => {
      const content = this.caseSensitive ? msg.content : msg.content.toLowerCase();

      // Check exclusion patterns first
      if (this.excludeKeywords.length > 0) {
        const hasExcluded = this.excludeKeywords.some(kw =>
          content.includes(this.caseSensitive ? kw : kw.toLowerCase())
        );
        if (hasExcluded) return false;
      }

      // Check inclusion patterns
      if (this.includeKeywords.length > 0) {
        const hasIncluded = this.includeKeywords.some(kw =>
          content.includes(this.caseSensitive ? kw : kw.toLowerCase())
        );
        return hasIncluded;
      }

      return true; // No filters = pass through
    });

    const filtered = context.messages.length - context.filteredMessages.length;
    context.metrics.stepDurations.set(this.stepId, Date.now() - startTime);

    this.logger.info(`${this.stepId}: Filtered ${filtered}/${context.messages.length} messages`);
    return context;
  }

  validateConfig(config: StepConfig): boolean {
    if (!Array.isArray(config.config.includeKeywords) &&
        !Array.isArray(config.config.excludeKeywords)) {
      return false;
    }
    return true;
  }

  getMetadata() {
    return {
      name: 'Keyword Filter',
      description: 'Pre-filters messages based on keyword patterns',
      version: '1.0.0',
    };
  }
}
```

**BatchClassifyStep.ts:**

```typescript
import { BasePipelineStep } from '../base/BasePipelineStep';
import { PipelineContext } from '../../core/PipelineContext';
import { StepType, StepConfig } from '../../core/interfaces';
import { z } from 'zod';

/**
 * Classifies messages into conversation threads using LLM
 */
export class BatchClassifyStep extends BasePipelineStep {
  readonly stepType = StepType.CLASSIFY;

  private promptId: string;
  private model: string;

  constructor(config: StepConfig) {
    super(config);
    this.promptId = config.config.promptId || 'thread-classification';
    this.model = config.config.model || 'gemini-2.5-flash';
  }

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const startTime = Date.now();

    // Get prompt template
    const rendered = context.prompts.render(this.promptId, {
      projectName: context.domainConfig.context.projectName,
      domain: context.domainConfig.context.domain,
      categories: this.formatCategories(context.domainConfig.categories),
      messagesToAnalyze: this.formatMessages(context.filteredMessages),
      contextText: this.formatMessages(context.contextMessages),
    });

    // Define response schema
    const responseSchema = z.object({
      threads: z.array(z.object({
        category: z.string(),
        messages: z.array(z.number()),
        summary: z.string(),
        docValueReason: z.string(),
        ragSearchCriteria: z.object({
          keywords: z.array(z.string()),
          semanticQuery: z.string(),
        }),
      })),
    });

    // Call LLM
    const { data, response } = await context.llmHandler.requestJSON(
      {
        model: this.model,
        systemPrompt: rendered.system,
        userPrompt: rendered.user,
        maxTokens: 32768,
      },
      responseSchema,
      {
        instanceId: context.instanceId,
        batchId: context.batchId,
        purpose: 'classification',
      }
    );

    // Store threads in context
    context.threads = data.threads.map(t => ({
      id: `thread_${t.messages[0]}_${Date.now()}`,
      category: t.category,
      messageIds: t.messages,
      summary: t.summary,
      docValueReason: t.docValueReason,
      ragSearchCriteria: t.ragSearchCriteria,
    }));

    // Update metrics
    context.metrics.llmCalls++;
    context.metrics.llmTokensUsed += response.tokensUsed || 0;
    context.metrics.stepDurations.set(this.stepId, Date.now() - startTime);

    this.logger.info(`${this.stepId}: Classified ${context.threads.length} threads`);
    return context;
  }

  private formatCategories(categories: CategoryDefinition[]): string {
    return categories
      .map(c => `- **${c.label}**: ${c.description}`)
      .join('\n');
  }

  private formatMessages(messages: UnifiedMessage[]): string {
    return messages
      .map((m, idx) => `[${idx}] [${m.timestamp.toISOString()}] ${m.author}: ${m.content}`)
      .join('\n\n');
  }

  validateConfig(config: StepConfig): boolean {
    return typeof config.config.promptId === 'string';
  }

  getMetadata() {
    return {
      name: 'Batch Classifier',
      description: 'Classifies messages into conversation threads using LLM',
      version: '1.0.0',
    };
  }
}
```

**RagEnrichStep.ts:**

```typescript
import { BasePipelineStep } from '../base/BasePipelineStep';
import { PipelineContext } from '../../core/PipelineContext';
import { StepType, StepConfig } from '../../core/interfaces';

/**
 * Enriches threads with RAG documentation context
 */
export class RagEnrichStep extends BasePipelineStep {
  readonly stepType = StepType.ENRICH;

  private topK: number;

  constructor(config: StepConfig) {
    super(config);
    this.topK = config.config.topK || 5;
  }

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const startTime = Date.now();

    // Only process valuable threads (skip no-doc-value)
    const valuableThreads = context.threads.filter(t =>
      t.category !== 'no-doc-value'
    );

    for (const thread of valuableThreads) {
      // Build search query from RAG criteria
      const searchQuery = thread.ragSearchCriteria.semanticQuery ||
        thread.ragSearchCriteria.keywords.join(' ');

      // Perform RAG search
      const results = await context.ragService.searchSimilarDocs(
        searchQuery,
        this.topK * 2 // Fetch more for deduplication
      );

      // Apply path filtering if configured
      const filtered = this.filterByPaths(results, context.domainConfig.ragPaths);

      // Store in context
      context.ragResults.set(thread.id, filtered.slice(0, this.topK));
    }

    context.metrics.stepDurations.set(this.stepId, Date.now() - startTime);
    this.logger.info(`${this.stepId}: Enriched ${valuableThreads.length} threads with RAG context`);

    return context;
  }

  private filterByPaths(
    results: RagDocument[],
    pathFilter?: PathFilter
  ): RagDocument[] {
    if (!pathFilter) return results;

    return results.filter(doc => {
      // Check exclusions first
      if (pathFilter.exclude) {
        const isExcluded = pathFilter.exclude.some(pattern =>
          this.matchGlob(doc.filePath, pattern)
        );
        if (isExcluded) return false;
      }

      // Check inclusions
      if (pathFilter.include) {
        return pathFilter.include.some(pattern =>
          this.matchGlob(doc.filePath, pattern)
        );
      }

      return true;
    });
  }

  private matchGlob(path: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(path);
  }

  validateConfig(config: StepConfig): boolean {
    return typeof config.config.topK === 'number' && config.config.topK > 0;
  }

  getMetadata() {
    return {
      name: 'RAG Enrichment',
      description: 'Adds relevant documentation context to threads',
      version: '1.0.0',
    };
  }
}
```

**ProposalGenerateStep.ts:**

```typescript
import { BasePipelineStep } from '../base/BasePipelineStep';
import { PipelineContext } from '../../core/PipelineContext';
import { StepType, StepConfig } from '../../core/interfaces';
import { z } from 'zod';

/**
 * Generates documentation change proposals using LLM
 */
export class ProposalGenerateStep extends BasePipelineStep {
  readonly stepType = StepType.GENERATE;

  private promptId: string;
  private model: string;

  constructor(config: StepConfig) {
    super(config);
    this.promptId = config.config.promptId || 'changeset-generation';
    this.model = config.config.model || 'gemini-2.5-pro';
  }

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const startTime = Date.now();

    // Only process threads with RAG context
    const threadsWithRag = Array.from(context.ragResults.keys());

    for (const threadId of threadsWithRag) {
      const thread = context.threads.find(t => t.id === threadId);
      if (!thread) continue;

      const ragDocs = context.ragResults.get(threadId) || [];

      // Render prompt
      const rendered = context.prompts.render(this.promptId, {
        projectName: context.domainConfig.context.projectName,
        domain: context.domainConfig.context.domain,
        threadSummary: thread.summary,
        ragContext: this.formatRagDocs(ragDocs),
        messages: this.formatThreadMessages(thread, context),
      });

      // Define response schema
      const responseSchema = z.object({
        proposals: z.array(z.object({
          updateType: z.enum(['INSERT', 'UPDATE', 'DELETE', 'NONE']),
          page: z.string(),
          section: z.string().optional(),
          suggestedText: z.string().optional(),
          reasoning: z.string(),
          sourceMessages: z.array(z.number()).optional(),
        })),
        proposalsRejected: z.boolean().optional(),
        rejectionReason: z.string().optional(),
      });

      // Call LLM
      const { data, response } = await context.llmHandler.requestJSON(
        {
          model: this.model,
          systemPrompt: rendered.system,
          userPrompt: rendered.user,
          maxTokens: 32768,
        },
        responseSchema,
        {
          instanceId: context.instanceId,
          batchId: context.batchId,
          purpose: 'proposal',
        }
      );

      // Store proposals
      context.proposals.set(threadId, data.proposals);

      // Update metrics
      context.metrics.llmCalls++;
      context.metrics.llmTokensUsed += response.tokensUsed || 0;
    }

    context.metrics.stepDurations.set(this.stepId, Date.now() - startTime);

    const totalProposals = Array.from(context.proposals.values())
      .reduce((sum, p) => sum + p.length, 0);

    this.logger.info(`${this.stepId}: Generated ${totalProposals} proposals for ${threadsWithRag.length} threads`);
    return context;
  }

  private formatRagDocs(docs: RagDocument[]): string {
    return docs
      .map((doc, idx) => `[DOC ${idx + 1}] ${doc.title}\nPath: ${doc.filePath}\n\n${doc.content}`)
      .join('\n\n---\n\n');
  }

  private formatThreadMessages(thread: ConversationThread, context: PipelineContext): string {
    const messages = context.messages.filter(m =>
      thread.messageIds.includes(m.id)
    );

    return messages
      .map(m => `[${m.id}] ${m.author}: ${m.content}`)
      .join('\n\n');
  }

  validateConfig(config: StepConfig): boolean {
    return typeof config.config.promptId === 'string';
  }

  getMetadata() {
    return {
      name: 'Proposal Generator',
      description: 'Generates documentation change proposals using LLM',
      version: '1.0.0',
    };
  }
}
```

**PipelineOrchestrator.ts:**

```typescript
import { IPipelineOrchestrator, PipelineContext, PipelineConfig, PipelineResult } from './interfaces';
import { StepFactory } from './StepFactory';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PipelineOrchestrator');

/**
 * Orchestrates execution of pipeline steps
 */
export class PipelineOrchestrator implements IPipelineOrchestrator {
  private config: PipelineConfig;
  private stepFactory: StepFactory;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.stepFactory = new StepFactory();
  }

  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();
    const errors: PipelineError[] = [];

    logger.info(`Starting pipeline execution for batch ${context.batchId}`);

    // Create steps from configuration
    const steps = this.config.steps
      .filter(s => s.enabled)
      .map(s => this.stepFactory.create(s));

    // Execute steps in sequence
    for (const step of steps) {
      try {
        logger.info(`Executing step: ${step.stepId}`);
        await step.execute(context);
      } catch (error) {
        const pipelineError: PipelineError = {
          stepId: step.stepId,
          message: `Step execution failed: ${error.message}`,
          error: error as Error,
          context: { batchId: context.batchId },
        };

        errors.push(pipelineError);
        context.errors.push(pipelineError);

        logger.error(`Step ${step.stepId} failed:`, error);

        if (this.config.errorHandling.stopOnError) {
          logger.error('Stopping pipeline due to error');
          break;
        }
      }
    }

    // Calculate metrics
    context.metrics.totalDurationMs = Date.now() - startTime;

    // Build result
    const result: PipelineResult = {
      success: errors.length === 0,
      messagesProcessed: context.filteredMessages.length,
      threadsCreated: context.threads.length,
      proposalsGenerated: Array.from(context.proposals.values())
        .reduce((sum, p) => sum + p.length, 0),
      errors,
      metrics: context.metrics,
    };

    logger.info(`Pipeline execution complete: ${result.messagesProcessed} messages, ${result.threadsCreated} threads, ${result.proposalsGenerated} proposals`);

    return result;
  }

  getConfig(): PipelineConfig {
    return this.config;
  }

  registerStep(stepType: string, factory: StepFactory): void {
    this.stepFactory.registerCustomStep(stepType, factory);
  }

  getMetrics(): PipelineMetrics {
    return {
      totalDurationMs: 0,
      stepDurations: new Map(),
      llmCalls: 0,
      llmTokensUsed: 0,
      llmCostUSD: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }
}
```

### File Changes Summary

**New Files:**
- `server/pipeline/core/PipelineOrchestrator.ts`
- `server/pipeline/core/PipelineContext.ts`
- `server/pipeline/core/StepFactory.ts`
- `server/pipeline/core/interfaces.ts`
- `server/pipeline/steps/base/BasePipelineStep.ts`
- `server/pipeline/steps/filter/KeywordFilterStep.ts`
- `server/pipeline/steps/classify/BatchClassifyStep.ts`
- `server/pipeline/steps/enrich/RagEnrichStep.ts`
- `server/pipeline/steps/generate/ProposalGenerateStep.ts`
- `server/pipeline/handlers/ILLMHandler.ts`
- `server/pipeline/handlers/GeminiHandler.ts`
- `server/pipeline/prompts/PromptRegistry.ts`
- `server/pipeline/prompts/PromptRenderer.ts`
- `server/pipeline/prompts/PromptValidator.ts`
- `server/pipeline/config/DomainConfigLoader.ts`
- `server/pipeline/config/PipelineConfigLoader.ts`
- `config/defaults/prompts/thread-classification.md`
- `config/defaults/prompts/changeset-generation.md`
- `config/defaults/prompts/file-consolidation.md`
- `config/defaults/domains/generic.json`
- `config/defaults/pipelines/default.json`
- `config/{instanceId}/domains/custom-domain.json`
- `config/{instanceId}/pipelines/custom-pipeline.json`

**Modified Files:**
- `server/stream/processors/batch-message-processor.ts` - Refactor to use PipelineOrchestrator
- `server/stream/llm/llm-service.ts` - Implement ILLMHandler interface
- `server/config/instance-loader.ts` - Add domain/pipeline config loading

## 6. Dependencies

### External Libraries

**No new external dependencies required.** All necessary libraries already exist:

- `zod@^3.22.0` - Schema validation (already in use)
- `@google/generative-ai@^0.21.0` - Gemini API (already in use)
- `@prisma/client@^5.0.0` - Database client (already in use)

### Internal Services

**Required Services:**
- `MessageVectorSearch` (`server/stream/message-vector-search.ts`) - RAG retrieval
- `InstanceConfigLoader` (`server/config/instance-loader.ts`) - Configuration management
- `llmCache` (`server/llm/llm-cache.ts`) - LLM response caching
- `PrismaClient` - Database access

### Infrastructure Requirements

**File System:**
- Read access to `config/{instanceId}/prompts/` directory
- Read access to `config/{instanceId}/domains/` directory
- Read access to `config/{instanceId}/pipelines/` directory

**S3 (if enabled):**
- Read access to `configs/{instanceId}/prompts/` prefix
- Read access to `configs/{instanceId}/domains/` prefix
- Read access to `configs/{instanceId}/pipelines/` prefix

### Third-Party APIs

**Gemini API:**
- `gemini-2.5-flash` - Fast classification (already in use)
- `gemini-2.5-pro` - Powerful proposal generation (already in use)

**Future Support:**
- OpenAI API - GPT-4, GPT-4-turbo (interface ready)
- Anthropic API - Claude 3.5 Sonnet (interface ready)
- Ollama - Local LLM hosting (interface ready)

## 7. Testing Requirements

### Unit Tests

**Test Files to Create:**

**`tests/pipeline/steps/KeywordFilterStep.test.ts`:**

```typescript
describe('KeywordFilterStep', () => {
  it('should filter messages with exclude keywords', async () => {
    const step = new KeywordFilterStep({
      stepId: 'test-filter',
      stepType: StepType.FILTER,
      enabled: true,
      config: {
        excludeKeywords: ['spam', 'scam'],
      },
    });

    const context = createMockContext({
      messages: [
        { id: 1, content: 'Hello world' },
        { id: 2, content: 'This is spam' },
        { id: 3, content: 'SCAM ALERT' },
      ],
    });

    await step.execute(context);

    expect(context.filteredMessages).toHaveLength(1);
    expect(context.filteredMessages[0].id).toBe(1);
  });

  it('should pass messages with include keywords', async () => {
    const step = new KeywordFilterStep({
      stepId: 'test-filter',
      stepType: StepType.FILTER,
      enabled: true,
      config: {
        includeKeywords: ['validator', 'staking'],
      },
    });

    const context = createMockContext({
      messages: [
        { id: 1, content: 'My validator is down' },
        { id: 2, content: 'How do I stake?' },
        { id: 3, content: 'Random message' },
      ],
    });

    await step.execute(context);

    expect(context.filteredMessages).toHaveLength(2);
  });
});
```

**`tests/pipeline/steps/BatchClassifyStep.test.ts`:**

```typescript
describe('BatchClassifyStep', () => {
  it('should classify messages into threads', async () => {
    const mockLLMHandler = {
      requestJSON: jest.fn().mockResolvedValue({
        data: {
          threads: [
            {
              category: 'troubleshooting',
              messages: [1, 2],
              summary: 'Validator connection issues',
              docValueReason: 'Users struggling with RPC setup',
              ragSearchCriteria: {
                keywords: ['validator', 'rpc', 'connection'],
                semanticQuery: 'validator node connection problems',
              },
            },
          ],
        },
        response: { tokensUsed: 1500 },
      }),
    };

    const context = createMockContext({
      llmHandler: mockLLMHandler,
      filteredMessages: [
        { id: 1, content: 'My validator cant connect' },
        { id: 2, content: 'Try checking your RPC endpoint' },
      ],
    });

    const step = new BatchClassifyStep({
      stepId: 'test-classify',
      stepType: StepType.CLASSIFY,
      enabled: true,
      config: {
        promptId: 'thread-classification',
        model: 'gemini-2.5-flash',
      },
    });

    await step.execute(context);

    expect(context.threads).toHaveLength(1);
    expect(context.threads[0].category).toBe('troubleshooting');
    expect(context.threads[0].messageIds).toEqual([1, 2]);
  });
});
```

**Coverage Expectations:**
- All pipeline steps: >80% coverage
- Core orchestrator: >90% coverage
- Prompt registry: >85% coverage
- Configuration loaders: >80% coverage

**Mocking Strategies:**
- Mock LLM handlers to avoid API calls
- Mock database with in-memory Prisma
- Mock file system with `memfs`
- Use dependency injection for all external services

### Integration Tests

**Test Files to Create:**

**`tests/pipeline/integration/pipeline-e2e.test.ts`:**

```typescript
describe('Pipeline End-to-End', () => {
  let db: PrismaClient;
  let orchestrator: PipelineOrchestrator;

  beforeAll(async () => {
    db = await createTestDatabase();
    orchestrator = new PipelineOrchestrator(loadTestPipelineConfig());
  });

  it('should process batch from messages to proposals', async () => {
    // Insert test messages
    await db.unifiedMessage.createMany({
      data: [
        {
          messageId: 'test-1',
          streamId: 'test-stream',
          timestamp: new Date(),
          author: 'user1',
          content: 'My validator keeps crashing',
          processingStatus: 'PENDING',
        },
        {
          messageId: 'test-2',
          streamId: 'test-stream',
          timestamp: new Date(),
          author: 'user2',
          content: 'Check your memory limits',
          processingStatus: 'PENDING',
        },
      ],
    });

    // Build context
    const context = await buildPipelineContext({
      instanceId: 'test',
      batchId: 'test-batch-1',
      db,
    });

    // Execute pipeline
    const result = await orchestrator.execute(context);

    // Verify results
    expect(result.success).toBe(true);
    expect(result.messagesProcessed).toBe(2);
    expect(result.threadsCreated).toBeGreaterThan(0);

    // Verify database persistence
    const classifications = await db.messageClassification.findMany();
    expect(classifications).toHaveLength(2);

    const proposals = await db.docProposal.findMany();
    expect(proposals.length).toBeGreaterThan(0);
  });
});
```

**Test Scenarios:**
- Full pipeline execution with real database
- Error handling when LLM fails
- Retry logic for transient failures
- Configuration hot-reload
- Multi-instance isolation

### E2E Tests

**`tests/e2e/validator-domain.test.ts`:**

```typescript
describe('Custom Domain Configuration', () => {
  it('should filter non-domain messages', async () => {
    // Load custom domain config
    const config = await loadDomainConfig('{instanceId}', 'custom-domain');

    // Execute pipeline with mixed messages
    const result = await runPipeline({
      messages: [
        'My validator is offline',           // INCLUDE
        'How do I build a DApp?',            // EXCLUDE (not validator topic)
        'Staking rewards not showing',       // INCLUDE
        'NFT marketplace question',          // EXCLUDE
      ],
      domainConfig: config,
    });

    expect(result.threadsCreated).toBe(2); // Only validator threads
  });
});
```

### Manual Testing Checklist

- [ ] Load default configuration and verify backward compatibility
- [ ] Create custom prompt template and verify hot-reload
- [ ] Configure validator domain and verify filtering
- [ ] Test keyword exclusion with spam messages
- [ ] Verify RAG path filtering excludes i18n docs
- [ ] Test error handling when LLM returns invalid JSON
- [ ] Verify metrics tracking for all pipeline steps
- [ ] Test multi-instance isolation (instanceA vs instanceB configs)
- [ ] Verify proposal generation respects security rules
- [ ] Test configuration precedence (defaults < instance < env)

## 8. Security Considerations

### Authentication Requirements

**No authentication changes.** Pipeline execution runs server-side in trusted context.

### Authorization Rules

**Configuration Access Control:**
- Instance configuration can only be loaded by authenticated admin users
- Prompt templates in S3 require IAM role with read permissions
- Hot-reload endpoint (future) requires admin JWT

### Data Protection

**Sensitive Data Handling:**
- Prompt templates may contain project-specific context but no PII
- Message content already sanitized before entering pipeline
- LLM responses cached without sensitive metadata

**Security Rules in Domain Config:**

```json
{
  "security": {
    "blockPatterns": [
      "private[_\\s]?key",
      "secret[_\\s]?token",
      "0x[a-fA-F0-9]{64}"
    ],
    "requireApproval": true,
    "maxProposalsPerBatch": 50
  }
}
```

**Validation in ProposalGenerateStep:**

```typescript
// Check for blocked patterns in proposed text
for (const pattern of context.domainConfig.security?.blockPatterns || []) {
  const regex = new RegExp(pattern, 'gi');
  if (regex.test(proposal.suggestedText)) {
    proposal.warnings = proposal.warnings || [];
    proposal.warnings.push(`Blocked pattern detected: ${pattern}`);
  }
}
```

### Input Validation

**Prompt Template Validation:**
- All templates validated with Zod before loading
- Required variables checked against prompt content
- Reject templates with unescaped user input placeholders

**Domain Configuration Validation:**
- Category IDs must be alphanumeric + hyphens only
- Keywords sanitized to prevent regex injection
- Path patterns validated as safe glob patterns

### XSS/CSRF Protection

**Not Applicable:** Server-side only, no user-facing forms.

### Injection Prevention

**Prompt Injection Mitigation:**
- User message content escaped before template interpolation
- System prompts immutable, only user prompts accept variables
- LLM responses validated against strict schemas

**Code Injection Prevention:**
- No `eval()` or dynamic code execution
- Configuration files parsed as JSON/YAML only
- Step types limited to registered factories

## 9. Performance Considerations

### Expected Load

**Current Batch Metrics (Example Instance):**
- Batch size: 30 messages every 24 hours
- Classification: 1 LLM call per batch (~2-4k tokens input, ~1k output)
- Proposals: 5-10 LLM calls per batch (~3-5k tokens input, ~2k output each)
- Total daily LLM calls: ~50-100
- Total daily tokens: ~500k

**Projected Load (5 Instances):**
- Total daily LLM calls: ~250-500
- Total daily tokens: ~2.5M
- Cost estimate: ~$3-5/day at Gemini pricing

### Caching Strategy

**LLM Response Caching:**
- Cache key: Hash of (prompt + variables)
- TTL: 24 hours for classification, 7 days for proposals
- Storage: Redis (existing `llmCache` service)
- Estimated cache hit rate: 15-20% (duplicate messages)

**Configuration Caching:**
- Prompt templates cached in memory after first load
- Domain configs cached for 1 hour
- Hot-reload invalidates cache
- No database queries for configuration after initial load

**RAG Result Caching:**
- Cache key: Hash of semantic query
- TTL: 1 hour
- Storage: Redis with vector similarity metadata
- Estimated cache hit rate: 30-40% (similar questions)

### Optimization Requirements

**Pipeline Parallelization:**
- RAG enrichment can run in parallel for multiple threads
- Proposal generation can run in parallel for independent threads
- Use `Promise.all()` for batch operations

**Token Usage Optimization:**
- Truncate RAG documents to 2000 chars per doc
- Limit context messages to 100 most recent
- Use smaller model (Flash) for classification

**Query Optimization:**
- Batch database inserts for classifications/proposals
- Use Prisma transactions for atomic batch updates
- Index on `(processingStatus, timestamp)` for watermark queries

### Database Query Optimization

**Existing Indexes (Sufficient):**
```sql
-- Already exists in schema
CREATE INDEX idx_unified_message_processing ON unified_message(processing_status, timestamp);
CREATE INDEX idx_unified_message_stream ON unified_message(stream_id, timestamp);
```

**Batch Insert Strategy:**

```typescript
// Instead of individual creates
for (const classification of classifications) {
  await db.messageClassification.create({ data: classification });
}

// Use createMany
await db.messageClassification.createMany({
  data: classifications,
  skipDuplicates: true, // Handle retries gracefully
});
```

**Pagination for Large Batches:**

```typescript
// Process messages in chunks
const CHUNK_SIZE = 100;
for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
  const chunk = messages.slice(i, i + CHUNK_SIZE);
  await processChunk(chunk);
}
```

## 10. Error Handling

### Error Scenarios

**LLM API Failures:**
- Network timeout → Retry with exponential backoff (3 attempts)
- Rate limit → Wait and retry after delay
- Invalid JSON response → Log error, skip batch, retry on next run
- Model unavailable → Fall back to alternative model

**Configuration Errors:**
- Missing prompt template → Use default template, log warning
- Invalid domain config → Fail fast on startup with clear error
- Malformed JSON → Detailed validation error with line number

**Pipeline Execution Errors:**
- Step throws exception → Log error, continue to next step (if `stopOnError: false`)
- Context corruption → Rollback database transaction, mark batch as failed
- Timeout exceeded → Cancel execution, partial results saved

### User-Facing Error Messages

**Not Applicable:** This is a backend system. Errors appear in admin UI as batch processing failures.

**Admin UI Error Display:**

```typescript
{
  "batchId": "stream_1704067200000",
  "status": "FAILED",
  "error": "Pipeline step 'batch-classify' failed: LLM returned invalid JSON",
  "retriable": true,
  "lastAttempt": "2025-01-01T12:00:00Z",
  "nextRetry": "2025-01-01T13:00:00Z"
}
```

### Logging Requirements

**Log Levels:**
- `ERROR`: LLM failures, validation errors, database errors
- `WARN`: Cache misses, fallback configs used, partial results
- `INFO`: Pipeline start/end, step execution, metrics
- `DEBUG`: Prompt rendering, intermediate state, configuration loads

**Structured Logging Format:**

```typescript
logger.info('Pipeline execution started', {
  instanceId: '{instanceId}',
  batchId: 'stream_1704067200000',
  messageCount: 30,
  pipelineConfig: 'validators',
});

logger.error('Step execution failed', {
  stepId: 'batch-classify',
  stepType: 'CLASSIFY',
  error: error.message,
  stack: error.stack,
  context: { batchId, instanceId },
});
```

**Log Aggregation:**
- All logs sent to stdout (Docker captures)
- Structured JSON format for parsing
- Include trace IDs for request correlation

### Rollback Procedures

**Batch Processing Rollback:**

1. **Detection:** Pipeline fails mid-execution
2. **Isolation:** Mark batch as `PROCESSING_FAILED` in watermark table
3. **Cleanup:** Delete partial `MessageClassification` and `DocProposal` records
4. **Retry:** Next cron run reprocesses from watermark

**Database Transaction Strategy:**

```typescript
// Wrap each conversation processing in transaction
await db.$transaction(async (tx) => {
  // Store classification
  await tx.messageClassification.createMany({ data: classifications });

  // Store RAG context
  await tx.conversationRagContext.create({ data: ragContext });

  // Store proposals
  await tx.docProposal.createMany({ data: proposals });

  // Mark messages complete
  await tx.unifiedMessage.updateMany({
    where: { id: { in: messageIds } },
    data: { processingStatus: 'COMPLETED' },
  });
});
// If any step fails, entire conversation rolls back
```

**Configuration Rollback:**

- Prompt templates versioned in Git
- Hot-reload from previous commit on validation failure
- Domain configs backed up daily to S3

## 11. Deployment Notes

### Migration Steps

**Phase 1: Preparation (No Downtime)**

1. Deploy new pipeline code alongside existing processor
2. Create default configuration files
3. Verify backward compatibility with existing tests

**Phase 2: Configuration Migration**

1. Create `config/defaults/prompts/` directory
2. Copy prompts from `prompt-templates.ts` to markdown files
3. Create default domain config from current hardcoded categories
4. Create default pipeline config matching current flow

**Phase 3: Code Migration (Requires Restart)**

1. Update `batch-message-processor.ts` to use `PipelineOrchestrator`
2. Update `llm-service.ts` to implement `ILLMHandler`
3. Deploy with feature flag `USE_PIPELINE_V2=false` (disabled)
4. Smoke test in staging environment

**Phase 4: Gradual Rollout**

1. Enable for low-traffic instance first
2. Monitor metrics for 24 hours
3. Enable for production instance
4. Monitor for 48 hours
5. Remove feature flag, make pipeline default

**Database Migrations:**

No schema changes required. Existing tables compatible.

### Feature Flags

```typescript
// Environment variable control
const USE_PIPELINE_V2 = process.env.USE_PIPELINE_V2 === 'true';

// In batch-message-processor.ts
if (USE_PIPELINE_V2) {
  return this.processBatchV2(); // New pipeline
} else {
  return this.processBatchV1(); // Legacy
}
```

### Rollout Strategy

**Phased by Instance:**
1. Internal test instance (day 1)
2. Low-traffic instance (day 3)
3. Production instances (day 7)
4. All instances (day 10)

**Success Criteria Per Phase:**
- Zero pipeline execution errors
- LLM cost within 10% of baseline
- Proposal quality maintained (manual review)
- Processing latency <5% increase

### Rollback Plan

**Immediate Rollback (Emergency):**

```bash
# Set feature flag to disable
export USE_PIPELINE_V2=false

# Restart services
pm2 restart backend
```

**Graceful Rollback (Planned):**

1. Disable feature flag for affected instance
2. Reprocess failed batches with legacy pipeline
3. Investigate root cause in non-production environment
4. Fix and redeploy

**Data Integrity:**
- No data loss on rollback (same database schema)
- Failed batches automatically retry with legacy pipeline

## 12. Open Questions

### Technical Unknowns

**Q1: Should pipeline steps support conditional execution?**
- **Context:** Some steps may only be needed for certain message types
- **Options:**
  - Add `condition` field to step config (e.g., `"condition": "context.threads.length > 0"`)
  - Use separate pipeline configs for different scenarios
- **Decision Needed:** Simplicity vs. flexibility trade-off

**Q2: How to handle schema evolution for LLM responses?**
- **Context:** Categories/fields may change over time
- **Options:**
  - Version prompts and schemas together
  - Support multiple schema versions simultaneously
  - Use backward-compatible schema additions only
- **Decision Needed:** Migration strategy for existing data

**Q3: Should hot-reload be automatic or manual?**
- **Context:** Configuration changes could be deployed via CI/CD
- **Options:**
  - File watcher with automatic reload (risk of unvalidated configs)
  - Admin API endpoint to trigger reload (safer, requires auth)
  - TTL-based cache expiry (eventual consistency)
- **Decision Needed:** Safety vs. convenience

### Decisions Pending

**Pending Decision 1: Custom Step Registration**
- **Question:** Should instances be able to define custom pipeline steps in configuration?
- **Impact:** High flexibility but increases complexity and testing surface
- **Recommendation:** Defer to Phase 2, start with built-in steps only

**Pending Decision 2: Multi-Model Support**
- **Question:** Should pipeline support running different LLM providers per step?
- **Impact:** Cost optimization but adds complexity in handler management
- **Recommendation:** Implement interface now, add providers incrementally

**Pending Decision 3: Observability**
- **Question:** Should we add OpenTelemetry tracing for pipeline steps?
- **Impact:** Better debugging but adds dependency and overhead
- **Recommendation:** Add basic metrics first, defer full tracing

### Risks Needing Mitigation

**Risk 1: Configuration Sprawl**
- **Description:** Each instance creates many override files, hard to maintain
- **Mitigation:**
  - Provide configuration validator CLI tool
  - Document configuration inheritance clearly
  - Create templates for common use cases

**Risk 2: Prompt Template Drift**
- **Description:** Instance-specific prompts diverge from best practices
- **Mitigation:**
  - Quarterly prompt review process
  - Maintain golden examples in documentation
  - Add prompt quality metrics (proposal acceptance rate)

**Risk 3: Performance Regression**
- **Description:** Abstraction layers add overhead, slow processing
- **Mitigation:**
  - Benchmark before/after with realistic data
  - Profile hot paths with node --prof
  - Set performance budgets (max 10% latency increase)

**Risk 4: Breaking Changes in LLM APIs**
- **Description:** Gemini deprecates models or changes response format
- **Mitigation:**
  - Abstract LLM interactions behind interfaces (done)
  - Pin model versions in configuration
  - Monitor Gemini API changelog
  - Maintain fallback models

---

## Configuration Examples

### Default Prompt Template

**File: `config/defaults/prompts/thread-classification.md`**

```markdown
---
id: thread-classification
version: "1.0.0"
metadata:
  author: Wayne
  description: Classifies messages into conversation threads
  requiredVariables:
    - projectName
    - domain
    - categories
    - messagesToAnalyze
    - contextText
  tags:
    - classification
    - batch-processing
---

# System Prompt

You are a documentation expert analyzing 24 hours of community conversations about the {{projectName}} {{domain}}.

**YOUR TASK**: Classify EVERY message into a conversation thread. Each message must be classified - do not skip any.

**THREAD TYPES**:

{{categories}}

**THREAD GROUPING RULES**:
- Related messages discussing the same topic form ONE thread
- A thread can be 1 message OR multiple messages
- Single-message threads are ACCEPTABLE and ENCOURAGED
- If a message stands alone but has doc value, create a 1-message thread
- If a message has no doc value, create a 1-message thread with category "no-doc-value"

**FOR EACH THREAD, PROVIDE**:

1. **category**: Type of conversation (max 50 chars)
2. **messages**: Array of message IDs
3. **summary**: Concise conversation summary (max 200 chars)
4. **docValueReason**: Specific reason for classification (max 300 chars)
5. **ragSearchCriteria**: Help find relevant existing documentation

**CRITICAL**: Every message ID must appear in exactly ONE thread. Account for all messages.

---

# User Prompt

Classify EVERY message into threads for the {{projectName}} {{domain}}. Account for all message IDs.

Return JSON with this structure:
```json
{
  "threads": [
    {
      "category": "troubleshooting|question|information|update|no-doc-value",
      "messages": [123, 124],
      "summary": "Brief summary of conversation",
      "docValueReason": "Specific reason for classification",
      "ragSearchCriteria": {
        "keywords": ["keyword1", "keyword2"],
        "semanticQuery": "natural language search query"
      }
    }
  ]
}
```

CONTEXT MESSAGES (previous 24 hours, for reference only):
{{contextText}}

---

MESSAGES TO ANALYZE (current 24-hour batch):
{{messagesToAnalyze}}
```

### Custom Domain Configuration Example

**File: `config/{instanceId}/domains/custom-domain.json`**

```json
{
  "domainId": "custom-domain",
  "name": "Custom Domain Operations",
  "description": "Focus on specific domain operations and related topics",
  "categories": [
    {
      "id": "troubleshooting",
      "label": "Troubleshooting",
      "description": "Domain-specific issues, errors, performance problems",
      "priority": 100,
      "examples": [
        "Service offline after upgrade",
        "Performance degradation",
        "Connection issues"
      ]
    },
    {
      "id": "setup",
      "label": "Setup & Configuration",
      "description": "Questions about initial setup and configuration",
      "priority": 90,
      "examples": [
        "How to get started?",
        "System requirements",
        "Initial configuration"
      ]
    },
    {
      "id": "operations",
      "label": "Operations",
      "description": "Day-to-day operations and best practices",
      "priority": 85,
      "examples": [
        "How to perform upgrades?",
        "Monitoring best practices",
        "Backup and disaster recovery"
      ]
    },
    {
      "id": "advanced",
      "label": "Advanced Topics",
      "description": "Advanced features and complex scenarios",
      "priority": 75,
      "examples": [
        "Advanced configuration options",
        "Performance tuning",
        "Integration patterns"
      ]
    },
    {
      "id": "infrastructure",
      "label": "Infrastructure",
      "description": "Hardware, networking, cloud infrastructure",
      "priority": 70,
      "examples": [
        "Recommended server specs",
        "Network requirements",
        "Cloud provider options"
      ]
    },
    {
      "id": "no-doc-value",
      "label": "No Documentation Value",
      "description": "Off-topic discussions",
      "priority": 0,
      "examples": [
        "Unrelated questions",
        "General chat",
        "Non-technical discussions"
      ]
    }
  ],
  "keywords": {
    "include": [
      "keyword1",
      "keyword2",
      "relevant-term",
      "domain-specific"
    ],
    "exclude": [
      "off-topic",
      "unrelated",
      "spam"
    ],
    "caseSensitive": false
  },
  "ragPaths": {
    "include": [
      "docs/domain/**",
      "docs/guides/**",
      "docs/tutorials/**"
    ],
    "exclude": [
      "docs/archive/**",
      "i18n/**"
    ]
  },
  "security": {
    "blockPatterns": [
      "private[_\\s]?key",
      "secret[_\\s]?token",
      "\\b[a-f0-9]{64}\\b"
    ],
    "requireApproval": false,
    "maxProposalsPerBatch": 50
  },
  "context": {
    "projectName": "Project Name",
    "domain": "Domain Operations",
    "targetAudience": "Target audience description",
    "documentationPurpose": "Provide technical guidance for this domain"
  }
}
```

### Custom Pipeline Configuration Example

**File: `config/{instanceId}/pipelines/custom-pipeline.json`**

```json
{
  "instanceId": "{instanceId}",
  "pipelineId": "custom-v1",
  "description": "Custom domain-focused analysis pipeline",
  "steps": [
    {
      "stepId": "keyword-filter",
      "stepType": "filter",
      "enabled": true,
      "config": {
        "includeKeywords": ["keyword1", "keyword2", "relevant-term"],
        "excludeKeywords": ["off-topic", "unrelated", "spam"],
        "caseSensitive": false
      }
    },
    {
      "stepId": "batch-classify",
      "stepType": "classify",
      "enabled": true,
      "config": {
        "promptId": "thread-classification",
        "model": "gemini-2.5-flash",
        "temperature": 0.2,
        "maxTokens": 32768
      }
    },
    {
      "stepId": "rag-enrich",
      "stepType": "enrich",
      "enabled": true,
      "config": {
        "topK": 5,
        "minSimilarity": 0.7,
        "deduplicateTranslations": true
      }
    },
    {
      "stepId": "proposal-generate",
      "stepType": "generate",
      "enabled": true,
      "config": {
        "promptId": "changeset-generation",
        "model": "gemini-2.5-pro",
        "temperature": 0.4,
        "maxTokens": 32768,
        "maxProposalsPerThread": 5
      }
    }
  ],
  "errorHandling": {
    "stopOnError": false,
    "retryAttempts": 3,
    "retryDelayMs": 5000
  },
  "performance": {
    "maxConcurrentSteps": 1,
    "timeoutMs": 300000,
    "enableCaching": true
  }
}
```

### Generic Domain Configuration (Default)

**File: `config/defaults/domains/generic.json`**

```json
{
  "domainId": "generic",
  "name": "Generic Documentation",
  "description": "Default configuration for general-purpose documentation analysis",
  "categories": [
    {
      "id": "troubleshooting",
      "label": "Troubleshooting",
      "description": "Users solving problems",
      "priority": 90
    },
    {
      "id": "question",
      "label": "Question",
      "description": "Users asking how to do something",
      "priority": 85
    },
    {
      "id": "information",
      "label": "Information",
      "description": "Users sharing knowledge/updates",
      "priority": 80
    },
    {
      "id": "update",
      "label": "Update",
      "description": "Technology changes or announcements",
      "priority": 75
    },
    {
      "id": "no-doc-value",
      "label": "No Documentation Value",
      "description": "No documentation value",
      "priority": 0
    }
  ],
  "keywords": null,
  "ragPaths": {
    "exclude": ["i18n/**"]
  },
  "security": {
    "blockPatterns": [
      "private[_\\s]?key",
      "secret[_\\s]?token"
    ],
    "requireApproval": false,
    "maxProposalsPerBatch": 100
  },
  "context": {
    "projectName": "Documentation",
    "domain": "General",
    "targetAudience": "All users",
    "documentationPurpose": "Provide comprehensive technical documentation"
  }
}
```

---

## Success Metrics

### Implementation Success Criteria

- [ ] Zero code changes to customize instances for specific domains
- [ ] Pipeline executes with <10% latency increase vs. current
- [ ] Hot-reload updates prompts without restart
- [ ] All existing tests pass with new pipeline
- [ ] Configuration validation catches 100% of schema errors

### Quality Metrics

- [ ] Proposal acceptance rate maintains >60% (current baseline)
- [ ] Classification accuracy >85% (manual spot check)
- [ ] Zero security pattern violations in production
- [ ] LLM cost within 15% of baseline

### Operational Metrics

- [ ] Configuration deployment time <5 minutes
- [ ] Pipeline execution errors <1% of batches
- [ ] Cache hit rate >20% for LLM responses
- [ ] Documentation coverage for all interfaces 100%
