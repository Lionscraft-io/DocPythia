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
  LLMResponse,
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

  /**
   * Helper to log LLM call data for debugging.
   * Call this after making an LLM call to enable prompt debugging in the UI.
   *
   * @param context - Pipeline context
   * @param promptId - ID of the prompt template used
   * @param response - LLM response object
   */
  protected logLLMCall(context: PipelineContext, promptId: string, response: LLMResponse): void {
    // Get the raw template
    const template = context.prompts.get(promptId);

    // Get the last rendered prompt (steps should render before calling LLM)
    // We store the current state - steps can call this after rendering
    context.stepPromptLogs.set(this.stepId, {
      promptId,
      template: template
        ? { system: template.system, user: template.user }
        : { system: '', user: '' },
      resolved: { system: '', user: '' }, // Will be set by renderAndLogPrompt
      response: response.text,
    });
  }

  /**
   * Helper to render a prompt and log it for debugging.
   * Returns the rendered prompt for use in LLM calls.
   *
   * @param context - Pipeline context
   * @param promptId - ID of the prompt template
   * @param variables - Variables to substitute into the template
   * @returns Rendered prompt with system and user strings
   */
  protected renderAndLogPrompt(
    context: PipelineContext,
    promptId: string,
    variables: Record<string, unknown>
  ): { system: string; user: string } {
    // Get the raw template
    const template = context.prompts.get(promptId);

    // Render the prompt
    const rendered = context.prompts.render(promptId, variables);

    // Initialize prompt log entry (response will be added later)
    context.stepPromptLogs.set(this.stepId, {
      promptId,
      template: template
        ? { system: template.system, user: template.user }
        : { system: '', user: '' },
      resolved: { system: rendered.system, user: rendered.user },
      response: '', // Will be set after LLM call
    });

    return { system: rendered.system, user: rendered.user };
  }

  /**
   * Helper to update the LLM response in the prompt log.
   * Call this after receiving the LLM response.
   *
   * @param context - Pipeline context
   * @param response - LLM response text
   */
  protected updatePromptLogResponse(context: PipelineContext, response: string): void {
    const existing = context.stepPromptLogs.get(this.stepId);
    if (existing) {
      existing.response = response;
    }
  }
}
