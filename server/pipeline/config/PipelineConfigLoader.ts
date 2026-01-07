/**
 * Pipeline Configuration Loader
 *
 * Loads and validates pipeline configurations from JSON files.
 * Supports defaults with instance-specific overrides.
 *
 * @author Wayne
 * @created 2025-12-30
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { StepType, type PipelineConfig } from '../core/interfaces.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PipelineConfigLoader');

/**
 * Zod schema for step configuration
 */
const StepConfigSchema = z.object({
  stepId: z.string().min(1),
  stepType: z.nativeEnum(StepType),
  enabled: z.boolean(),
  config: z.record(z.unknown()),
});

/**
 * Zod schema for error handling configuration
 */
const ErrorHandlingConfigSchema = z.object({
  stopOnError: z.boolean(),
  retryAttempts: z.number().min(0).max(10),
  retryDelayMs: z.number().min(0),
});

/**
 * Zod schema for performance configuration
 */
const PerformanceConfigSchema = z.object({
  maxConcurrentSteps: z.number().min(1).max(10),
  timeoutMs: z.number().min(1000),
  enableCaching: z.boolean(),
});

/**
 * Zod schema for full pipeline configuration
 */
export const PipelineConfigSchema = z.object({
  instanceId: z.string().min(1),
  pipelineId: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(StepConfigSchema).min(1),
  errorHandling: ErrorHandlingConfigSchema,
  performance: PerformanceConfigSchema,
});

/**
 * Default pipeline configuration
 */
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  instanceId: 'default',
  pipelineId: 'default-v1',
  description: 'Default documentation analysis pipeline',
  steps: [
    {
      stepId: 'keyword-filter',
      stepType: StepType.FILTER,
      enabled: true,
      config: {
        includeKeywords: [],
        excludeKeywords: [],
        caseSensitive: false,
      },
    },
    {
      stepId: 'batch-classify',
      stepType: StepType.CLASSIFY,
      enabled: true,
      config: {
        promptId: 'thread-classification',
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxTokens: 32768,
      },
    },
    {
      stepId: 'rag-enrich',
      stepType: StepType.ENRICH,
      enabled: true,
      config: {
        topK: 5,
        minSimilarity: 0.7,
        deduplicateTranslations: true,
      },
    },
    {
      stepId: 'proposal-generate',
      stepType: StepType.GENERATE,
      enabled: true,
      config: {
        promptId: 'changeset-generation',
        model: 'gemini-2.5-pro',
        temperature: 0.4,
        maxTokens: 32768,
        maxProposalsPerThread: 5,
      },
    },
    {
      stepId: 'content-validate',
      stepType: StepType.VALIDATE,
      enabled: false, // Optional step - enable when needed
      config: {
        maxRetries: 2,
        promptId: 'content-reformat',
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxTokens: 8192,
        skipPatterns: [], // Regex patterns for files to skip validation
      },
    },
    {
      stepId: 'length-reduce',
      stepType: StepType.CONDENSE,
      enabled: false, // Optional step - enable when needed
      config: {
        defaultMaxLength: 3000,
        defaultTargetLength: 2000,
        // Priority-based tiers (higher priority = more space allowed)
        priorityTiers: [
          { minPriority: 70, maxLength: 5000, targetLength: 3500 }, // High priority
          { minPriority: 40, maxLength: 3500, targetLength: 2500 }, // Medium priority
          { minPriority: 0, maxLength: 2000, targetLength: 1500 }, // Low priority
        ],
        promptId: 'content-condense',
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxTokens: 8192,
      },
    },
  ],
  errorHandling: {
    stopOnError: false,
    retryAttempts: 3,
    retryDelayMs: 5000,
  },
  performance: {
    maxConcurrentSteps: 1,
    timeoutMs: 300000,
    enableCaching: true,
  },
};

/**
 * Cache for loaded pipeline configurations
 */
const configCache = new Map<string, { config: PipelineConfig; loadedAt: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Load a pipeline configuration file
 */
async function loadConfigFile(filePath: string): Promise<PipelineConfig | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const validated = PipelineConfigSchema.parse(parsed);
    return validated as PipelineConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    logger.error(`Failed to load pipeline config from ${filePath}:`, error);
    throw error;
  }
}

/**
 * Merge pipeline configurations (instance overrides defaults)
 */
function mergeConfigs(
  defaults: PipelineConfig,
  overrides: Partial<PipelineConfig>
): PipelineConfig {
  // For steps, if instance provides any steps, use those entirely (no merge)
  const steps = overrides.steps || defaults.steps;

  return {
    instanceId: overrides.instanceId || defaults.instanceId,
    pipelineId: overrides.pipelineId || defaults.pipelineId,
    description: overrides.description || defaults.description,
    steps,
    errorHandling: overrides.errorHandling
      ? { ...defaults.errorHandling, ...overrides.errorHandling }
      : defaults.errorHandling,
    performance: overrides.performance
      ? { ...defaults.performance, ...overrides.performance }
      : defaults.performance,
  };
}

/**
 * Load pipeline configuration for an instance
 *
 * @param configBasePath - Base path for config files
 * @param instanceId - Instance identifier
 * @param pipelineId - Optional specific pipeline ID (defaults to 'default')
 */
export async function loadPipelineConfig(
  configBasePath: string,
  instanceId: string,
  pipelineId?: string
): Promise<PipelineConfig> {
  const configId = pipelineId || 'default';
  const cacheKey = `${instanceId}:${configId}`;

  // Check cache
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    logger.debug(`Using cached pipeline config: ${cacheKey}`);
    return cached.config;
  }

  logger.info(`Loading pipeline config for ${instanceId}`, { pipelineId: configId });

  // Load default config
  const defaultPath = path.join(configBasePath, 'defaults', 'pipelines', 'default.json');
  let config = (await loadConfigFile(defaultPath)) || DEFAULT_PIPELINE_CONFIG;

  // Load instance-specific config
  const instancePath = path.join(configBasePath, instanceId, 'pipelines', `${configId}.json`);

  const instanceConfig = await loadConfigFile(instancePath);
  if (instanceConfig) {
    config = mergeConfigs(config, instanceConfig);
    logger.debug(`Applied instance pipeline config: ${instancePath}`);
  }

  // Update instance ID if not set
  config.instanceId = instanceId;

  // Cache the result
  configCache.set(cacheKey, { config, loadedAt: Date.now() });

  return config;
}

/**
 * Clear the pipeline configuration cache
 */
export function clearPipelineConfigCache(): void {
  configCache.clear();
  logger.info('Pipeline config cache cleared');
}

/**
 * Validate a pipeline configuration object
 */
export function validatePipelineConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = PipelineConfigSchema.safeParse(config);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
  return { valid: false, errors };
}

/**
 * Get all available pipeline configurations for an instance
 */
export async function listPipelineConfigs(
  configBasePath: string,
  instanceId: string
): Promise<string[]> {
  const pipelines: string[] = [];

  // List default pipelines
  const defaultsDir = path.join(configBasePath, 'defaults', 'pipelines');
  try {
    const defaultFiles = await fs.readdir(defaultsDir);
    pipelines.push(
      ...defaultFiles.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
    );
  } catch {
    // Directory may not exist
  }

  // List instance pipelines
  const instanceDir = path.join(configBasePath, instanceId, 'pipelines');
  try {
    const instanceFiles = await fs.readdir(instanceDir);
    pipelines.push(
      ...instanceFiles.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
    );
  } catch {
    // Directory may not exist
  }

  return [...new Set(pipelines)];
}

/**
 * Get the default pipeline configuration
 */
export function getDefaultPipelineConfig(): PipelineConfig {
  return { ...DEFAULT_PIPELINE_CONFIG };
}
