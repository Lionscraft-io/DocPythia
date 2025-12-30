/**
 * Pipeline End-to-End Tests
 *
 * Full integration tests that:
 * - Load real configuration files
 * - Execute complete pipeline flows
 * - Validate outputs match expected behavior
 * - Test domain-specific configurations (NEAR validators)
 *
 * @author Wayne
 * @created 2025-12-30
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { PipelineOrchestrator } from '../server/pipeline/core/PipelineOrchestrator.js';
import { createPipelineContext } from '../server/pipeline/core/PipelineContext.js';
import { PromptRegistry } from '../server/pipeline/prompts/PromptRegistry.js';
import { createStepFactory } from '../server/pipeline/core/StepFactory.js';
import {
  loadDomainConfig,
  clearDomainConfigCache,
} from '../server/pipeline/config/DomainConfigLoader.js';
import {
  loadPipelineConfig,
  clearPipelineConfigCache,
} from '../server/pipeline/config/PipelineConfigLoader.js';
import {
  StepType,
  type UnifiedMessage,
  type ILLMHandler,
  type IRagService,
  type RagDocument,
} from '../server/pipeline/core/interfaces.js';

// Mock the logger
vi.mock('../server/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  hasErrorMessage: (error: unknown, message: string) =>
    error instanceof Error && error.message === message,
}));

// Configuration path
const CONFIG_BASE_PATH = path.join(process.cwd(), 'config');

// Test data
function createValidatorMessages(): UnifiedMessage[] {
  return [
    {
      id: 1,
      messageId: 'v-msg-1',
      streamId: 'near-zulip',
      timestamp: new Date('2025-01-15T09:00:00Z'),
      author: 'validator_operator',
      content:
        'My validator has been missing blocks since the last protocol upgrade. Anyone else experiencing this?',
      processingStatus: 'PENDING',
    },
    {
      id: 2,
      messageId: 'v-msg-2',
      streamId: 'near-zulip',
      timestamp: new Date('2025-01-15T09:05:00Z'),
      author: 'experienced_op',
      content:
        'Yes, you need to update your neard config for the new RPC endpoints. Check the chunk production settings.',
      processingStatus: 'PENDING',
    },
    {
      id: 3,
      messageId: 'v-msg-3',
      streamId: 'near-zulip',
      timestamp: new Date('2025-01-15T09:10:00Z'),
      author: 'validator_operator',
      content:
        'Thanks! The staking pool rewards also seem off. Is the epoch calculation different now?',
      processingStatus: 'PENDING',
    },
    {
      id: 4,
      messageId: 'v-msg-4',
      streamId: 'near-zulip',
      timestamp: new Date('2025-01-15T10:00:00Z'),
      author: 'random_user',
      content: 'Hey anyone know how to mint NFTs on NEAR? Looking for a good marketplace.',
      processingStatus: 'PENDING',
    },
    {
      id: 5,
      messageId: 'v-msg-5',
      streamId: 'near-zulip',
      timestamp: new Date('2025-01-15T11:00:00Z'),
      author: 'infra_engineer',
      content:
        'What are the recommended hardware specs for running an archival node? We need to support high RPC traffic.',
      processingStatus: 'PENDING',
    },
  ];
}

function createMockLLMHandler(): ILLMHandler {
  return {
    name: 'e2e-mock-llm',
    requestJSON: vi.fn().mockImplementation(async (request, schema, context) => {
      if (context.purpose === 'classification') {
        return {
          data: {
            threads: [
              {
                category: 'validator-troubleshooting',
                messages: [0, 1, 2],
                summary: 'Validator block production issues after upgrade',
                docValueReason: 'Common post-upgrade validator issues needing documentation',
                ragSearchCriteria: {
                  keywords: ['validator', 'blocks', 'upgrade', 'neard'],
                  semanticQuery: 'validator missing blocks after protocol upgrade configuration',
                },
              },
              {
                category: 'infrastructure',
                messages: [3],
                summary: 'Archival node hardware requirements',
                docValueReason: 'Infrastructure sizing guidance needed',
                ragSearchCriteria: {
                  keywords: ['archival', 'node', 'hardware', 'rpc'],
                  semanticQuery: 'archival node hardware specifications for high rpc traffic',
                },
              },
            ],
          },
          response: { text: '{}', model: 'gemini-2.5-flash', tokensUsed: 2500 },
        };
      } else if (context.purpose === 'proposal') {
        return {
          data: {
            proposals: [
              {
                updateType: 'UPDATE',
                page: 'docs/validator/troubleshooting.md',
                section: 'Post-Upgrade Issues',
                suggestedText:
                  '## Post-Upgrade Troubleshooting\n\nAfter a protocol upgrade, validators may experience block production issues...',
                reasoning: 'Community discussion revealed common post-upgrade configuration issues',
                sourceMessages: [0, 1],
              },
              {
                updateType: 'INSERT',
                page: 'docs/validator/configuration.md',
                section: 'RPC Endpoints',
                suggestedText:
                  '### Updated RPC Configuration\n\nEnsure your neard config includes the new RPC endpoints...',
                reasoning: 'Solution provided by experienced operator needs documentation',
                sourceMessages: [1],
              },
            ],
            proposalsRejected: false,
          },
          response: { text: '{}', model: 'gemini-2.5-pro', tokensUsed: 3500 },
        };
      }
      return { data: {}, response: { text: '{}', model: 'test' } };
    }),
    requestText: vi.fn().mockResolvedValue({
      text: 'Mock text response',
      model: 'test',
      tokensUsed: 100,
    }),
    getModelInfo: vi.fn().mockReturnValue({
      provider: 'mock',
      maxInputTokens: 1000000,
      maxOutputTokens: 8192,
      supportsFunctionCalling: true,
      supportsStreaming: true,
    }),
    estimateCost: vi.fn().mockReturnValue({
      inputTokens: 5000,
      outputTokens: 2000,
      estimatedCostUSD: 0.05,
    }),
  };
}

function createMockRagService(): IRagService {
  return {
    searchSimilarDocs: vi.fn().mockResolvedValue([
      {
        id: 1,
        filePath: 'docs/validator/troubleshooting.md',
        title: 'Validator Troubleshooting',
        content:
          '# Troubleshooting Guide\n\nThis guide covers common validator issues...\n\n## Sync Issues\nIf your validator is not syncing...',
        similarity: 0.88,
      },
      {
        id: 2,
        filePath: 'docs/validator/configuration.md',
        title: 'Validator Configuration',
        content:
          '# Configuration\n\nThis guide explains validator configuration options...\n\n## neard.conf\nThe main configuration file...',
        similarity: 0.82,
      },
      {
        id: 3,
        filePath: 'docs/integrate/running-a-node/archival-node.md',
        title: 'Archival Node Setup',
        content:
          '# Archival Node\n\nHow to run an archival node for full history...\n\n## Hardware Requirements\nMinimum specs...',
        similarity: 0.75,
      },
    ] as RagDocument[]),
  };
}

describe('Pipeline E2E Tests', () => {
  beforeAll(() => {
    // Clear caches before tests
    clearDomainConfigCache();
    clearPipelineConfigCache();
  });

  afterAll(() => {
    // Clear caches after tests
    clearDomainConfigCache();
    clearPipelineConfigCache();
  });

  describe('Configuration Loading', () => {
    it('should load default domain configuration', async () => {
      const config = await loadDomainConfig(CONFIG_BASE_PATH, 'default');

      expect(config).toBeDefined();
      expect(config.domainId).toBe('generic');
      expect(config.categories.length).toBeGreaterThan(0);
      expect(config.context.projectName).toBeDefined();
    });

    it('should load default pipeline configuration', async () => {
      const config = await loadPipelineConfig(CONFIG_BASE_PATH, 'default');

      expect(config).toBeDefined();
      expect(config.steps.length).toBe(4);
      expect(config.steps.map((s) => s.stepType)).toContain(StepType.FILTER);
      expect(config.steps.map((s) => s.stepType)).toContain(StepType.CLASSIFY);
      expect(config.steps.map((s) => s.stepType)).toContain(StepType.ENRICH);
      expect(config.steps.map((s) => s.stepType)).toContain(StepType.GENERATE);
    });

    it('should load NEAR validator domain configuration', async () => {
      const config = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');

      expect(config).toBeDefined();
      expect(config.domainId).toBe('near-validators');
      expect(config.name).toBe('NEAR Validator Operations');

      // Check validator-specific categories
      const categoryIds = config.categories.map((c) => c.id);
      expect(categoryIds).toContain('validator-troubleshooting');
      expect(categoryIds).toContain('staking-rewards');
      expect(categoryIds).toContain('infrastructure');

      // Check keywords
      expect(config.keywords?.include).toContain('validator');
      expect(config.keywords?.include).toContain('staking');
      expect(config.keywords?.exclude).toContain('nft');
    });

    it('should load NEAR validator pipeline configuration', async () => {
      const config = await loadPipelineConfig(CONFIG_BASE_PATH, 'near', 'validators');

      expect(config).toBeDefined();
      expect(config.pipelineId).toBe('validators-v1');

      // Check keyword filter has validator-specific keywords
      const filterStep = config.steps.find((s) => s.stepType === StepType.FILTER);
      expect(filterStep).toBeDefined();
      expect(filterStep!.config.includeKeywords).toContain('validator');
      expect(filterStep!.config.excludeKeywords).toContain('nft');
    });
  });

  describe('Prompt Loading', () => {
    it('should load default prompts', async () => {
      const registry = new PromptRegistry(path.join(CONFIG_BASE_PATH, 'defaults', 'prompts'));
      await registry.load();

      const prompts = registry.list();
      expect(prompts.length).toBeGreaterThan(0);

      // Check specific prompts exist
      const classificationPrompt = registry.get('thread-classification');
      expect(classificationPrompt).not.toBeNull();
      expect(classificationPrompt!.system).toContain('{{projectName}}');

      const generationPrompt = registry.get('changeset-generation');
      expect(generationPrompt).not.toBeNull();
    });

    it('should render prompts with variables', async () => {
      const registry = new PromptRegistry(path.join(CONFIG_BASE_PATH, 'defaults', 'prompts'));
      await registry.load();

      const rendered = registry.render('thread-classification', {
        projectName: 'NEAR Protocol',
        domain: 'Validator Operations',
        categories: '- Troubleshooting\n- Questions',
        messagesToAnalyze: 'Test messages here',
        contextText: 'Previous context',
      });

      expect(rendered.system).toContain('NEAR Protocol');
      expect(rendered.system).toContain('Validator Operations');
      expect(rendered.user).toContain('Test messages here');
    });
  });

  describe('Full Pipeline Execution', () => {
    it('should execute complete pipeline with default configuration', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'default');
      const pipelineConfig = await loadPipelineConfig(CONFIG_BASE_PATH, 'default');

      const llmHandler = createMockLLMHandler();
      const ragService = createMockRagService();

      const registry = new PromptRegistry(path.join(CONFIG_BASE_PATH, 'defaults', 'prompts'));
      await registry.load();

      const orchestrator = new PipelineOrchestrator(
        pipelineConfig,
        llmHandler,
        createStepFactory()
      );

      const context = createPipelineContext({
        instanceId: 'default',
        batchId: 'e2e-test-batch-001',
        streamId: 'test-stream',
        messages: createValidatorMessages(),
        domainConfig,
        prompts: registry,
        llmHandler,
        ragService,
        db: {} as any,
      });

      const result = await orchestrator.execute(context);

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBeGreaterThan(0);
      expect(result.threadsCreated).toBeGreaterThan(0);
      expect(result.proposalsGenerated).toBeGreaterThan(0);
    });

    it('should execute NEAR validator-focused pipeline', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');
      const pipelineConfig = await loadPipelineConfig(CONFIG_BASE_PATH, 'near', 'validators');

      const llmHandler = createMockLLMHandler();
      const ragService = createMockRagService();

      const registry = new PromptRegistry(path.join(CONFIG_BASE_PATH, 'defaults', 'prompts'));
      await registry.load();

      const orchestrator = new PipelineOrchestrator(
        pipelineConfig,
        llmHandler,
        createStepFactory()
      );

      const context = createPipelineContext({
        instanceId: 'near',
        batchId: 'near-e2e-batch-001',
        streamId: 'near-zulip',
        messages: createValidatorMessages(),
        domainConfig,
        prompts: registry,
        llmHandler,
        ragService,
        db: {} as any,
      });

      const result = await orchestrator.execute(context);

      // Should succeed
      expect(result.success).toBe(true);

      // Should filter out NFT message
      expect(context.filteredMessages.length).toBeLessThan(5);
      expect(context.filteredMessages.every((m) => !m.content.toLowerCase().includes('nft'))).toBe(
        true
      );

      // Should create threads for validator content
      expect(context.threads.length).toBeGreaterThan(0);

      // Should have proposals
      expect(result.proposalsGenerated).toBeGreaterThan(0);
    });

    it('should filter non-validator messages with keyword filter', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');
      const fullPipelineConfig = await loadPipelineConfig(CONFIG_BASE_PATH, 'near', 'validators');

      // Only run filter step - create a copy to not mutate the cached config
      const pipelineConfig = {
        ...fullPipelineConfig,
        steps: fullPipelineConfig.steps.filter((s) => s.stepType === StepType.FILTER),
      };

      const llmHandler = createMockLLMHandler();
      const orchestrator = new PipelineOrchestrator(
        pipelineConfig,
        llmHandler,
        createStepFactory()
      );

      const messages = createValidatorMessages();
      const context = createPipelineContext({
        instanceId: 'near',
        batchId: 'filter-test',
        streamId: 'test',
        messages,
        domainConfig,
        prompts: new PromptRegistry('/fake'),
        llmHandler,
        ragService: createMockRagService(),
        db: {} as any,
      });

      await orchestrator.execute(context);

      // NFT message (id: 4) should be filtered out
      const filteredIds = context.filteredMessages.map((m) => m.id);
      expect(filteredIds).not.toContain(4);

      // Validator-related messages should remain
      expect(filteredIds).toContain(1); // validator missing blocks
      expect(filteredIds).toContain(2); // neard config
      expect(filteredIds).toContain(3); // staking pool rewards
      expect(filteredIds).toContain(5); // archival node specs
    });
  });

  describe('Pipeline Metrics', () => {
    it('should track comprehensive metrics', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');
      const pipelineConfig = await loadPipelineConfig(CONFIG_BASE_PATH, 'near', 'validators');

      const llmHandler = createMockLLMHandler();
      const ragService = createMockRagService();

      const registry = new PromptRegistry(path.join(CONFIG_BASE_PATH, 'defaults', 'prompts'));
      await registry.load();

      const orchestrator = new PipelineOrchestrator(
        pipelineConfig,
        llmHandler,
        createStepFactory()
      );

      const context = createPipelineContext({
        instanceId: 'near',
        batchId: 'metrics-test',
        streamId: 'test',
        messages: createValidatorMessages(),
        domainConfig,
        prompts: registry,
        llmHandler,
        ragService,
        db: {} as any,
      });

      const result = await orchestrator.execute(context);

      // Check metrics (totalDurationMs may be 0 in fast test runs)
      expect(result.metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.stepDurations.size).toBe(4);
      expect(result.metrics.llmCalls).toBeGreaterThan(0);
      expect(result.metrics.llmTokensUsed).toBeGreaterThan(0);

      // Check individual step timings
      expect(result.metrics.stepDurations.get('keyword-filter')).toBeDefined();
      expect(result.metrics.stepDurations.get('batch-classify')).toBeDefined();
      expect(result.metrics.stepDurations.get('rag-enrich')).toBeDefined();
      expect(result.metrics.stepDurations.get('proposal-generate')).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty message batch gracefully', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'default');
      const pipelineConfig = await loadPipelineConfig(CONFIG_BASE_PATH, 'default');

      const llmHandler = createMockLLMHandler();
      const orchestrator = new PipelineOrchestrator(
        pipelineConfig,
        llmHandler,
        createStepFactory()
      );

      const context = createPipelineContext({
        instanceId: 'default',
        batchId: 'empty-batch',
        streamId: 'test',
        messages: [], // Empty
        domainConfig,
        prompts: new PromptRegistry('/fake'),
        llmHandler,
        ragService: createMockRagService(),
        db: {} as any,
      });

      const result = await orchestrator.execute(context);

      expect(result.success).toBe(true);
      expect(result.messagesProcessed).toBe(0);
      expect(result.threadsCreated).toBe(0);
      expect(result.proposalsGenerated).toBe(0);
    });

    it('should handle all messages filtered out', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');
      const pipelineConfig = await loadPipelineConfig(CONFIG_BASE_PATH, 'near', 'validators');

      const llmHandler = createMockLLMHandler();
      const orchestrator = new PipelineOrchestrator(
        pipelineConfig,
        llmHandler,
        createStepFactory()
      );

      // All messages about NFTs - should all be filtered
      const messages: UnifiedMessage[] = [
        {
          id: 1,
          messageId: 'nft-1',
          streamId: 'test',
          timestamp: new Date(),
          author: 'user1',
          content: 'Check out this NFT marketplace!',
          processingStatus: 'PENDING',
        },
        {
          id: 2,
          messageId: 'nft-2',
          streamId: 'test',
          timestamp: new Date(),
          author: 'user2',
          content: 'Best dapp for minting NFTs',
          processingStatus: 'PENDING',
        },
      ];

      const context = createPipelineContext({
        instanceId: 'near',
        batchId: 'all-filtered',
        streamId: 'test',
        messages,
        domainConfig,
        prompts: new PromptRegistry('/fake'),
        llmHandler,
        ragService: createMockRagService(),
        db: {} as any,
      });

      const result = await orchestrator.execute(context);

      expect(result.success).toBe(true);
      expect(context.filteredMessages.length).toBe(0);
      expect(result.threadsCreated).toBe(0);
    });
  });

  describe('Domain Configuration Behavior', () => {
    it('should respect security block patterns', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');

      // Check that security patterns are configured
      expect(domainConfig.security?.blockPatterns).toBeDefined();
      expect(domainConfig.security!.blockPatterns!.length).toBeGreaterThan(0);
      expect(domainConfig.security!.blockPatterns).toContain('private[_\\s]?key');
    });

    it('should respect RAG path filters', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');

      // Check RAG path configuration
      expect(domainConfig.ragPaths).toBeDefined();
      expect(domainConfig.ragPaths!.include).toContain('docs/validator/**');
      expect(domainConfig.ragPaths!.exclude).toContain('i18n/**');
    });

    it('should have correct context for prompts', async () => {
      const domainConfig = await loadDomainConfig(CONFIG_BASE_PATH, 'near', 'validators');

      expect(domainConfig.context.projectName).toBe('NEAR Protocol');
      expect(domainConfig.context.domain).toBe('Validator Operations');
      expect(domainConfig.context.targetAudience).toContain('operator');
    });
  });
});
