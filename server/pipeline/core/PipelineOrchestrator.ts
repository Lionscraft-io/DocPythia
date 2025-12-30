/**
 * Pipeline Orchestrator
 *
 * Coordinates execution of pipeline steps in sequence.
 * Handles errors, retries, and metrics collection.
 *
 * @author Wayne
 * @created 2025-12-30
 */

import type {
  IPipelineOrchestrator,
  PipelineContext,
  PipelineConfig,
  PipelineResult,
  PipelineMetrics,
  PipelineError,
  IPipelineStep,
  ILLMHandler,
} from './interfaces.js';
import { createLogger, getErrorMessage } from '../../utils/logger.js';
import { createInitialMetrics, serializeMetrics } from './PipelineContext.js';
import { StepFactory, getStepFactory } from './StepFactory.js';

const logger = createLogger('PipelineOrchestrator');

/**
 * Orchestrates execution of pipeline steps
 */
export class PipelineOrchestrator implements IPipelineOrchestrator {
  private config: PipelineConfig;
  private stepFactory: StepFactory;
  private llmHandler: ILLMHandler;

  constructor(config: PipelineConfig, llmHandler: ILLMHandler, stepFactory?: StepFactory) {
    this.config = config;
    this.llmHandler = llmHandler;
    this.stepFactory = stepFactory || getStepFactory();
  }

  /**
   * Execute pipeline with given context
   */
  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();
    const errors: PipelineError[] = [];

    logger.info(`Starting pipeline execution`, {
      instanceId: context.instanceId,
      batchId: context.batchId,
      pipelineId: this.config.pipelineId,
      messageCount: context.messages.length,
    });

    // Create steps from configuration
    const steps = this.createSteps();

    if (steps.length === 0) {
      logger.warn('No enabled steps in pipeline configuration');
      return this.buildResult(context, errors, startTime);
    }

    // Execute steps in sequence
    for (const step of steps) {
      const stepStartTime = Date.now();

      try {
        logger.info(`Executing step: ${step.stepId}`, {
          stepType: step.stepType,
          batchId: context.batchId,
        });

        // Execute with retry logic
        await this.executeStepWithRetry(step, context);

        const stepDuration = Date.now() - stepStartTime;
        context.metrics.stepDurations.set(step.stepId, stepDuration);

        logger.debug(`Step completed: ${step.stepId}`, {
          durationMs: stepDuration,
          filteredMessages: context.filteredMessages.length,
          threads: context.threads.length,
        });
      } catch (error) {
        const stepDuration = Date.now() - stepStartTime;
        context.metrics.stepDurations.set(step.stepId, stepDuration);

        const pipelineError: PipelineError = {
          stepId: step.stepId,
          message: `Step execution failed: ${getErrorMessage(error)}`,
          error: error instanceof Error ? error : new Error(String(error)),
          context: {
            batchId: context.batchId,
            instanceId: context.instanceId,
            stepType: step.stepType,
          },
        };

        errors.push(pipelineError);
        context.errors.push(pipelineError);

        logger.error(`Step ${step.stepId} failed`, {
          error: getErrorMessage(error),
          stepType: step.stepType,
          batchId: context.batchId,
        });

        if (this.config.errorHandling.stopOnError) {
          logger.error('Stopping pipeline due to error (stopOnError=true)');
          break;
        }
      }
    }

    // Calculate final metrics
    context.metrics.totalDurationMs = Date.now() - startTime;

    const result = this.buildResult(context, errors, startTime);

    logger.info('Pipeline execution complete', {
      success: result.success,
      messagesProcessed: result.messagesProcessed,
      threadsCreated: result.threadsCreated,
      proposalsGenerated: result.proposalsGenerated,
      totalDurationMs: result.metrics.totalDurationMs,
      metrics: serializeMetrics(result.metrics),
    });

    return result;
  }

  /**
   * Execute a step with retry logic
   */
  private async executeStepWithRetry(step: IPipelineStep, context: PipelineContext): Promise<void> {
    const { retryAttempts, retryDelayMs } = this.config.errorHandling;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        await step.execute(context);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retryAttempts) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          logger.warn(`Step ${step.stepId} failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxAttempts: retryAttempts + 1,
            error: getErrorMessage(error),
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Create pipeline steps from configuration
   */
  private createSteps(): IPipelineStep[] {
    const steps: IPipelineStep[] = [];

    for (const stepConfig of this.config.steps) {
      if (!stepConfig.enabled) {
        logger.debug(`Skipping disabled step: ${stepConfig.stepId}`);
        continue;
      }

      if (!this.stepFactory.hasStepType(stepConfig.stepType)) {
        logger.warn(`No factory registered for step type: ${stepConfig.stepType}`);
        continue;
      }

      const step = this.stepFactory.create(stepConfig, this.llmHandler);
      steps.push(step);
    }

    return steps;
  }

  /**
   * Build pipeline result
   */
  private buildResult(
    context: PipelineContext,
    errors: PipelineError[],
    startTime: number
  ): PipelineResult {
    const proposalsGenerated = Array.from(context.proposals.values()).reduce(
      (sum, proposals) => sum + proposals.length,
      0
    );

    return {
      success: errors.length === 0,
      messagesProcessed: context.filteredMessages.length,
      threadsCreated: context.threads.length,
      proposalsGenerated,
      errors,
      metrics: {
        ...context.metrics,
        totalDurationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Get pipeline configuration
   */
  getConfig(): PipelineConfig {
    return this.config;
  }

  /**
   * Register custom step creator
   */
  registerStep(
    stepType: string,
    creator: (config: any, llmHandler: ILLMHandler) => IPipelineStep
  ): void {
    this.stepFactory.register(stepType, creator);
    logger.debug(`Registered step factory: ${stepType}`);
  }

  /**
   * Get execution metrics
   */
  getMetrics(): PipelineMetrics {
    return createInitialMetrics();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
