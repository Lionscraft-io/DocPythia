/**
 * Tests for Transform Pipeline Steps
 *
 * Tests ContentValidationStep and LengthReductionStep functionality.
 *
 * @author Wayne
 * @created 2026-01-07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentValidationStep } from '../server/pipeline/steps/transform/ContentValidationStep.js';
import { LengthReductionStep } from '../server/pipeline/steps/transform/LengthReductionStep.js';
import {
  StepType,
  type PipelineContext,
  type ILLMHandler,
  type Proposal,
} from '../server/pipeline/core/interfaces.js';

// Mock LLM handler
const createMockLLMHandler = (): ILLMHandler => ({
  name: 'mock',
  requestJSON: vi.fn().mockResolvedValue({
    data: { reformattedContent: 'fixed content', condensedContent: 'shorter content' },
    response: { text: '', model: 'mock', tokensUsed: 100 },
  }),
  requestText: vi.fn().mockResolvedValue({ text: 'response', model: 'mock' }),
  getModelInfo: vi.fn().mockReturnValue({
    provider: 'mock',
    maxInputTokens: 100000,
    maxOutputTokens: 8192,
    supportsFunctionCalling: true,
    supportsStreaming: false,
  }),
  estimateCost: vi.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 }),
});

// Mock prompt registry
const createMockPromptRegistry = () => ({
  get: vi.fn().mockReturnValue(null),
  render: vi.fn().mockImplementation(() => {
    throw new Error('Prompt not found');
  }),
  list: vi.fn().mockReturnValue([]),
  reload: vi.fn().mockResolvedValue(undefined),
  validate: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
});

// Create a minimal pipeline context
const createMockContext = (proposals: Map<string, Proposal[]>): PipelineContext => ({
  messages: [],
  contextMessages: [],
  batchId: 'test-batch',
  streamId: 'test-stream',
  instanceId: 'test-instance',
  domainConfig: {
    domainId: 'test',
    name: 'Test Domain',
    categories: [],
    context: {
      projectName: 'Test',
      domain: 'test',
      targetAudience: 'developers',
      documentationPurpose: 'testing',
    },
  },
  prompts: createMockPromptRegistry(),
  filteredMessages: [],
  threads: [],
  ragResults: new Map(),
  proposals,
  llmHandler: createMockLLMHandler(),
  ragService: { searchSimilarDocs: vi.fn().mockResolvedValue([]) },
  db: {} as any,
  metrics: {
    totalDurationMs: 0,
    stepDurations: new Map(),
    llmCalls: 0,
    llmTokensUsed: 0,
    llmCostUSD: 0,
    cacheHits: 0,
    cacheMisses: 0,
  },
  errors: [],
});

describe('ContentValidationStep', () => {
  let step: ContentValidationStep;
  let mockLLMHandler: ILLMHandler;

  beforeEach(() => {
    mockLLMHandler = createMockLLMHandler();
    step = new ContentValidationStep(
      {
        stepId: 'test-validate',
        stepType: StepType.VALIDATE,
        enabled: true,
        config: {
          maxRetries: 2,
        },
      },
      mockLLMHandler
    );
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      expect(
        step.validateConfig({
          stepId: 'test',
          stepType: StepType.VALIDATE,
          enabled: true,
          config: { maxRetries: 2 },
        })
      ).toBe(true);
    });

    it('should reject maxRetries > 5', () => {
      expect(
        step.validateConfig({
          stepId: 'test',
          stepType: StepType.VALIDATE,
          enabled: true,
          config: { maxRetries: 10 },
        })
      ).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return step metadata', () => {
      const metadata = step.getMetadata();
      expect(metadata.name).toBe('Content Validator');
      expect(metadata.version).toBe('1.0.0');
    });
  });

  describe('execute - markdown validation', () => {
    it('should pass valid markdown through unchanged', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/guide.md',
              suggestedText:
                '# Valid Markdown\n\nSome `code` here.\n\n```js\nconsole.log("hello");\n```',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      const result = await step.execute(context);

      const resultProposals = result.proposals.get('thread-1')!;
      expect(resultProposals[0].suggestedText).toBe(
        '# Valid Markdown\n\nSome `code` here.\n\n```js\nconsole.log("hello");\n```'
      );
      expect(resultProposals[0].warnings).toBeUndefined();
    });

    it('should detect unbalanced code blocks', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/broken.md',
              suggestedText: '# Broken\n\n```js\nconsole.log("hello");',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      // Mock LLM to return fixed content
      (mockLLMHandler.requestJSON as any).mockResolvedValue({
        data: { reformattedContent: '# Broken\n\n```js\nconsole.log("hello");\n```' },
        response: { text: '', model: 'mock', tokensUsed: 100 },
      });
      context.llmHandler = mockLLMHandler;

      await step.execute(context);

      // LLM should have been called to fix it
      expect(mockLLMHandler.requestJSON).toHaveBeenCalled();
    });

    it('should detect unbalanced inline code', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/broken.md',
              suggestedText: 'Use `code without closing',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      context.llmHandler = mockLLMHandler;

      await step.execute(context);

      // Should attempt to reformat
      expect(mockLLMHandler.requestJSON).toHaveBeenCalled();
    });

    it('should skip DELETE proposals', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'DELETE',
              page: 'docs/removed.md',
              suggestedText: 'Some content',
              reasoning: 'remove page',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      await step.execute(context);

      // No LLM call for DELETE
      expect(mockLLMHandler.requestJSON).not.toHaveBeenCalled();
    });
  });

  describe('execute - JSON validation', () => {
    it('should pass valid JSON through unchanged', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'config.json',
              suggestedText: '{"key": "value", "num": 42}',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      const result = await step.execute(context);

      const resultProposals = result.proposals.get('thread-1')!;
      expect(resultProposals[0].suggestedText).toBe('{"key": "value", "num": 42}');
    });

    it('should detect invalid JSON', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'config.json',
              suggestedText: '{"key": "value" "missing": "comma"}',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      context.llmHandler = mockLLMHandler;

      await step.execute(context);

      // LLM should have been called
      expect(mockLLMHandler.requestJSON).toHaveBeenCalled();
    });
  });

  describe('execute - YAML validation', () => {
    it('should pass valid YAML through unchanged', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'config.yaml',
              suggestedText: 'key: value\nlist:\n  - item1\n  - item2',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      const result = await step.execute(context);

      const resultProposals = result.proposals.get('thread-1')!;
      expect(resultProposals[0].suggestedText).toBe('key: value\nlist:\n  - item1\n  - item2');
    });

    it('should detect invalid YAML', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'config.yml',
              suggestedText: 'key: value\n  bad_indent: here',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      context.llmHandler = mockLLMHandler;

      await step.execute(context);

      // LLM should have been called
      expect(mockLLMHandler.requestJSON).toHaveBeenCalled();
    });
  });

  describe('execute - skip patterns', () => {
    it('should skip files matching skip patterns', async () => {
      const stepWithSkip = new ContentValidationStep(
        {
          stepId: 'test-validate',
          stepType: StepType.VALIDATE,
          enabled: true,
          config: {
            maxRetries: 2,
            skipPatterns: ['\\.min\\.js$', 'vendor/'],
          },
        },
        mockLLMHandler
      );

      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'bundle.min.js',
              suggestedText: 'invalid {{{ content',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      await stepWithSkip.execute(context);

      // Should skip, no LLM call
      expect(mockLLMHandler.requestJSON).not.toHaveBeenCalled();
    });
  });
});

describe('LengthReductionStep', () => {
  let step: LengthReductionStep;
  let mockLLMHandler: ILLMHandler;

  beforeEach(() => {
    mockLLMHandler = createMockLLMHandler();
    step = new LengthReductionStep(
      {
        stepId: 'test-condense',
        stepType: StepType.CONDENSE,
        enabled: true,
        config: {
          defaultMaxLength: 100,
          defaultTargetLength: 50,
          priorityTiers: [
            { minPriority: 70, maxLength: 200, targetLength: 150 },
            { minPriority: 0, maxLength: 100, targetLength: 50 },
          ],
        },
      },
      mockLLMHandler
    );
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      expect(
        step.validateConfig({
          stepId: 'test',
          stepType: StepType.CONDENSE,
          enabled: true,
          config: { defaultMaxLength: 1000, defaultTargetLength: 500 },
        })
      ).toBe(true);
    });

    it('should reject defaultMaxLength < 100', () => {
      expect(
        step.validateConfig({
          stepId: 'test',
          stepType: StepType.CONDENSE,
          enabled: true,
          config: { defaultMaxLength: 50 },
        })
      ).toBe(false);
    });

    it('should reject priorityTier with targetLength >= maxLength', () => {
      expect(
        step.validateConfig({
          stepId: 'test',
          stepType: StepType.CONDENSE,
          enabled: true,
          config: {
            priorityTiers: [{ minPriority: 0, maxLength: 100, targetLength: 100 }],
          },
        })
      ).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return step metadata', () => {
      const metadata = step.getMetadata();
      expect(metadata.name).toBe('Length Reducer');
      expect(metadata.version).toBe('1.1.0');
    });
  });

  describe('execute', () => {
    it('should pass short content through unchanged', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/short.md',
              suggestedText: 'Short content',
              reasoning: 'test',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      const result = await step.execute(context);

      const resultProposals = result.proposals.get('thread-1')!;
      expect(resultProposals[0].suggestedText).toBe('Short content');
      expect(mockLLMHandler.requestJSON).not.toHaveBeenCalled();
    });

    it('should condense content exceeding maxLength (single attempt)', async () => {
      const longContent = 'A'.repeat(150); // Exceeds default maxLength of 100
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/long.md',
              suggestedText: longContent,
              reasoning: 'test',
            },
          ],
        ],
      ]);

      // Mock LLM to return condensed content
      (mockLLMHandler.requestJSON as any).mockResolvedValue({
        data: { condensedContent: 'Shorter version' },
        response: { text: '', model: 'mock', tokensUsed: 100 },
      });

      const context = createMockContext(proposals);
      context.llmHandler = mockLLMHandler;
      const result = await step.execute(context);

      expect(mockLLMHandler.requestJSON).toHaveBeenCalledTimes(1); // Single attempt
      const resultProposals = result.proposals.get('thread-1')!;
      expect(resultProposals[0].suggestedText).toBe('Shorter version');
      expect(resultProposals[0].warnings?.some((w) => w.includes('Condensed'))).toBe(true);
    });

    it('should use priority-based max lengths', async () => {
      const longContent = 'A'.repeat(150); // Exceeds low priority max (100) but not high (200)
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-high',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/important.md',
              suggestedText: longContent,
              reasoning: 'test',
            },
          ],
        ],
      ]);

      // Add a high priority category and thread
      const context = createMockContext(proposals);
      context.domainConfig.categories = [
        { id: 'important', label: 'Important', description: 'High priority', priority: 80 },
      ];
      context.threads = [
        {
          id: 'thread-high',
          category: 'important',
          messageIds: [],
          summary: '',
          docValueReason: '',
          ragSearchCriteria: { keywords: [], semanticQuery: '' },
        },
      ];
      context.llmHandler = mockLLMHandler;

      const result = await step.execute(context);

      // Should NOT condense because 150 < 200 (high priority max)
      expect(mockLLMHandler.requestJSON).not.toHaveBeenCalled();
      const resultProposals = result.proposals.get('thread-high')!;
      expect(resultProposals[0].suggestedText).toBe(longContent);
    });

    it('should skip DELETE proposals', async () => {
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'DELETE',
              page: 'docs/removed.md',
              suggestedText: 'A'.repeat(200),
              reasoning: 'remove',
            },
          ],
        ],
      ]);

      const context = createMockContext(proposals);
      await step.execute(context);

      expect(mockLLMHandler.requestJSON).not.toHaveBeenCalled();
    });

    it('should always use LLM result (even if longer)', async () => {
      const longContent = 'A'.repeat(150);
      const proposals = new Map<string, Proposal[]>([
        [
          'thread-1',
          [
            {
              updateType: 'UPDATE',
              page: 'docs/long.md',
              suggestedText: longContent,
              reasoning: 'test',
            },
          ],
        ],
      ]);

      // Mock LLM to return even longer content
      const llmResult = 'B'.repeat(160);
      (mockLLMHandler.requestJSON as any).mockResolvedValue({
        data: { condensedContent: llmResult },
        response: { text: '', model: 'mock', tokensUsed: 100 },
      });

      const context = createMockContext(proposals);
      context.llmHandler = mockLLMHandler;
      const result = await step.execute(context);

      const resultProposals = result.proposals.get('thread-1')!;
      // Should use LLM result regardless
      expect(resultProposals[0].suggestedText).toBe(llmResult);
      expect(resultProposals[0].warnings?.some((w) => w.includes('Condensed'))).toBe(true);
    });
  });
});
