/**
 * Pipeline Orchestrator
 *
 * Coordinates execution of pipeline steps in sequence.
 * Handles errors, retries, and metrics collection.
 * Logs pipeline runs to PipelineRunLog for debugging.
 *
 * @author Wayne
 * @created 2025-12-30
 * @updated 2026-01-19 - Added PipelineRunLog integration
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
import type { Prisma } from '@prisma/client';
import { createLogger, getErrorMessage } from '../../utils/logger.js';
import { createInitialMetrics, serializeMetrics } from './PipelineContext.js';
import { StepFactory, getStepFactory } from './StepFactory.js';

const logger = createLogger('PipelineOrchestrator');

/**
 * Step execution log entry for PipelineRunLog
 */
interface StepLogEntry {
  stepName: string;
  stepType: string;
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
  inputCount?: number;
  outputCount?: number;
  promptUsed?: string;
  error?: string;
}

/**
 * Orchestrates execution of pipeline steps
 */
export class PipelineOrchestrator implements IPipelineOrchestrator {
  private config: PipelineConfig;
  private stepFactory: StepFactory;
  private llmHandler: ILLMHandler;
  private enableRunLogging: boolean;

  constructor(
    config: PipelineConfig,
    llmHandler: ILLMHandler,
    stepFactory?: StepFactory,
    options?: { enableRunLogging?: boolean }
  ) {
    this.config = config;
    this.llmHandler = llmHandler;
    this.stepFactory = stepFactory || getStepFactory();
    this.enableRunLogging = options?.enableRunLogging ?? true;
  }

  /**
   * Execute pipeline with given context
   */
  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();
    const errors: PipelineError[] = [];
    const stepLogs: StepLogEntry[] = [];
    let runLogId: number | null = null;

    logger.info(`Starting pipeline execution`, {
      instanceId: context.instanceId,
      batchId: context.batchId,
      pipelineId: this.config.pipelineId,
      messageCount: context.messages.length,
    });

    // Create initial PipelineRunLog entry
    if (this.enableRunLogging && context.db) {
      try {
        const runLog = await context.db.pipelineRunLog.create({
          data: {
            instanceId: context.instanceId,
            batchId: context.batchId,
            pipelineId: this.config.pipelineId,
            status: 'running',
            inputMessages: context.messages.length,
            steps: [],
          },
        });
        runLogId = runLog.id;
        logger.debug(`Created PipelineRunLog entry: ${runLogId}`);
      } catch (error) {
        logger.warn('Failed to create PipelineRunLog entry:', error);
      }
    }

    // Create steps from configuration
    const steps = this.createSteps();

    if (steps.length === 0) {
      logger.warn('No enabled steps in pipeline configuration');
      await this.updateRunLog(context, runLogId, 'completed', stepLogs, errors, startTime);
      return this.buildResult(context, errors, startTime);
    }

    // Execute steps in sequence
    for (const step of steps) {
      const stepStartTime = Date.now();
      const stepLog: StepLogEntry = {
        stepName: step.stepId,
        stepType: step.stepType,
        status: 'completed',
        durationMs: 0,
      };

      try {
        logger.info(`Executing step: ${step.stepId}`, {
          stepType: step.stepType,
          batchId: context.batchId,
        });

        // Capture input counts before execution
        stepLog.inputCount = this.getInputCount(step.stepType, context);

        // Execute with retry logic
        await this.executeStepWithRetry(step, context);

        const stepDuration = Date.now() - stepStartTime;
        context.metrics.stepDurations.set(step.stepId, stepDuration);

        // Capture output counts after execution
        stepLog.durationMs = stepDuration;
        stepLog.outputCount = this.getOutputCount(step.stepType, context);
        stepLog.status = 'completed';

        stepLogs.push(stepLog);

        logger.debug(`Step completed: ${step.stepId}`, {
          durationMs: stepDuration,
          filteredMessages: context.filteredMessages.length,
          threads: context.threads.length,
        });
      } catch (error) {
        const stepDuration = Date.now() - stepStartTime;
        context.metrics.stepDurations.set(step.stepId, stepDuration);

        stepLog.durationMs = stepDuration;
        stepLog.status = 'failed';
        stepLog.error = getErrorMessage(error);
        stepLogs.push(stepLog);

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

    // Update PipelineRunLog with final results
    await this.updateRunLog(
      context,
      runLogId,
      result.success ? 'completed' : 'failed',
      stepLogs,
      errors,
      startTime
    );

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
   * Update PipelineRunLog with execution results
   */
  private async updateRunLog(
    context: PipelineContext,
    runLogId: number | null,
    status: string,
    stepLogs: StepLogEntry[],
    errors: PipelineError[],
    startTime: number
  ): Promise<void> {
    if (!this.enableRunLogging || !context.db || !runLogId) {
      return;
    }

    try {
      const proposalsGenerated = Array.from(context.proposals.values()).reduce(
        (sum, proposals) => sum + proposals.length,
        0
      );

      await context.db.pipelineRunLog.update({
        where: { id: runLogId },
        data: {
          status,
          steps: stepLogs as unknown as Prisma.InputJsonValue,
          outputThreads: context.threads.length,
          outputProposals: proposalsGenerated,
          totalDurationMs: Date.now() - startTime,
          llmCalls: context.metrics.llmCalls,
          llmTokensUsed: context.metrics.llmTokensUsed,
          errorMessage: errors.length > 0 ? errors.map((e) => e.message).join('; ') : null,
          completedAt: new Date(),
        },
      });
      logger.debug(`Updated PipelineRunLog entry: ${runLogId}`);
    } catch (error) {
      logger.warn('Failed to update PipelineRunLog entry:', error);
    }
  }

  /**
   * Get input count for a step type
   */
  private getInputCount(stepType: string, context: PipelineContext): number {
    switch (stepType) {
      case 'filter':
        return context.messages.length;
      case 'classify':
        return context.filteredMessages.length;
      case 'enrich':
      case 'context-enrich':
        return context.threads.length;
      case 'generate':
        return context.threads.length;
      case 'ruleset-review':
      case 'validate':
      case 'condense':
        return Array.from(context.proposals.values()).reduce((sum, p) => sum + p.length, 0);
      default:
        return 0;
    }
  }

  /**
   * Get output count for a step type
   */
  private getOutputCount(stepType: string, context: PipelineContext): number {
    switch (stepType) {
      case 'filter':
        return context.filteredMessages.length;
      case 'classify':
        return context.threads.length;
      case 'enrich':
      case 'context-enrich':
        return context.ragResults.size;
      case 'generate':
      case 'ruleset-review':
      case 'validate':
      case 'condense':
        return Array.from(context.proposals.values()).reduce((sum, p) => sum + p.length, 0);
      default:
        return 0;
    }
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
