/**
 * Base Pipeline Step
 *
 * Abstract base class for all pipeline steps.
 * Provides common functionality and enforces the step interface.
 *
 * @author Wayne
 * @created 2025-12-30
 */

import type {
  IPipelineStep,
  StepType,
  StepConfig,
  StepMetadata,
  PipelineContext,
  ILLMHandler,
} from '../../core/interfaces.js';
import { createLogger, type Logger } from '../../../utils/logger.js';

/**
 * Abstract base class for pipeline steps
 */
export abstract class BasePipelineStep implements IPipelineStep {
  readonly stepId: string;
  abstract readonly stepType: StepType;

  protected config: StepConfig;
  protected logger: Logger;
  protected llmHandler?: ILLMHandler;

  constructor(config: StepConfig, llmHandler?: ILLMHandler) {
    this.stepId = config.stepId;
    this.config = config;
    this.llmHandler = llmHandler;
    this.logger = createLogger(`Step:${config.stepId}`);
  }

  /**
   * Execute this step with the given context
   * Must be implemented by subclasses
   */
  abstract execute(context: PipelineContext): Promise<PipelineContext>;

  /**
   * Validate step configuration
   * Can be overridden by subclasses for custom validation
   */
  validateConfig(config: StepConfig): boolean {
    if (!config.stepId || typeof config.stepId !== 'string') {
      this.logger.error('Step configuration missing stepId');
      return false;
    }
    if (!config.stepType || typeof config.stepType !== 'string') {
      this.logger.error('Step configuration missing stepType');
      return false;
    }
    return true;
  }

  /**
   * Get step metadata
   * Should be overridden by subclasses to provide specific metadata
   */
  getMetadata(): StepMetadata {
    return {
      name: this.stepId,
      description: 'Pipeline step',
      version: '1.0.0',
    };
  }

  /**
   * Helper to get a required config value
   */
  protected getConfigValue<T>(key: string, defaultValue?: T): T {
    const value = this.config.config[key];
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Missing required config key: ${key}`);
    }
    return value as T;
  }

  /**
   * Helper to record step timing in metrics
   */
  protected recordTiming(context: PipelineContext, startTime: number): void {
    const duration = Date.now() - startTime;
    context.metrics.stepDurations.set(this.stepId, duration);
  }

  /**
   * Helper to add an error to context
   */
  protected addError(
    context: PipelineContext,
    error: Error,
    additionalContext?: Record<string, unknown>
  ): void {
    context.errors.push({
      stepId: this.stepId,
      message: error.message,
      error,
      context: {
        batchId: context.batchId,
        instanceId: context.instanceId,
        ...additionalContext,
      },
    });
  }

  /**
   * Helper to check if LLM handler is available
   */
  protected requireLLMHandler(): ILLMHandler {
    if (!this.llmHandler) {
      throw new Error(`Step ${this.stepId} requires LLM handler but none provided`);
    }
    return this.llmHandler;
  }
}
