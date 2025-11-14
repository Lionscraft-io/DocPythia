/**
 * Stream Manager
 * Central coordinator for all stream adapters with scheduling and concurrency control
 * Author: Wayne
 * Date: 2025-10-30
 * Reference: /docs/specs/multi-stream-scanner-phase-1.md
 */

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { StreamAdapter } from './adapters/base-adapter.js';
import { CsvFileAdapter } from './adapters/csv-file-adapter.js';
import { TelegramBotAdapter } from './adapters/telegram-bot-adapter.js';
import { InstanceConfigLoader } from '../config/instance-loader.js';
import { getInstanceDb } from '../db/instance-db.js';
import type { StreamMessage } from './types.js';

export interface StreamManagerConfig {
  maxConcurrentStreams?: number;
  defaultBatchSize?: number;
  enableScheduling?: boolean;
  errorRetryAttempts?: number;
  errorRetryDelay?: number;
}

export interface StreamHealth {
  streamId: string;
  isHealthy: boolean;
  lastSuccessfulRun: Date | null;
  lastError: string | null;
  totalProcessed: number;
  errorCount: number;
}

export class StreamManager {
  private adapters: Map<string, StreamAdapter> = new Map();
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private runningStreams: Set<string> = new Set();
  private config: Required<StreamManagerConfig>;
  private streamToInstance: Map<string, string> = new Map(); // Track which instance each stream belongs to

  constructor(config?: StreamManagerConfig) {
    const schedulingEnabled = process.env.STREAM_SCHEDULING_ENABLED === 'true';

    this.config = {
      maxConcurrentStreams: config?.maxConcurrentStreams || parseInt(process.env.MAX_CONCURRENT_STREAMS || '3'),
      defaultBatchSize: config?.defaultBatchSize || parseInt(process.env.MESSAGE_BATCH_SIZE || '10'),
      enableScheduling: config?.enableScheduling ?? schedulingEnabled,
      errorRetryAttempts: config?.errorRetryAttempts || parseInt(process.env.STREAM_ERROR_RETRY_ATTEMPTS || '3'),
      errorRetryDelay: config?.errorRetryDelay || parseInt(process.env.STREAM_ERROR_RETRY_DELAY || '60000'),
    };

    console.log('StreamManager initialized with config:', this.config);
  }

  /**
   * Initialize the stream manager by loading all configured streams
   * Loads streams from ALL instance databases
   */
  async initialize(): Promise<void> {
    console.log('Initializing StreamManager...');

    try {
      // Get all available instances
      const availableInstances = InstanceConfigLoader.getAvailableInstances();
      console.log(`Loading streams from ${availableInstances.length} instances:`, availableInstances);

      let totalStreams = 0;

      // Load streams from each instance database
      for (const instanceId of availableInstances) {
        try {
          const instanceDb = getInstanceDb(instanceId);

          // Load all active stream configurations from this instance's database
          const streamConfigs = await instanceDb.streamConfig.findMany({
            where: {
              enabled: true,
            },
          });

          console.log(`Found ${streamConfigs.length} active streams for instance "${instanceId}"`);

          // Register adapters for each stream
          for (const config of streamConfigs) {
            try {
              // Track which instance this stream belongs to
              this.streamToInstance.set(config.streamId, instanceId);

              await this.registerStream(config, instanceId, instanceDb);
              totalStreams++;
            } catch (error) {
              console.error(`Failed to register stream ${config.streamId} for instance ${instanceId}:`, error);
            }
          }
        } catch (error) {
          console.error(`Failed to load streams for instance "${instanceId}":`, error);
        }
      }

      console.log(`StreamManager initialized with ${totalStreams} streams across ${availableInstances.length} instances`);
    } catch (error) {
      console.error('Failed to initialize StreamManager:', error);
      throw error;
    }
  }

  /**
   * Register a stream adapter with optional scheduling
   * @param streamConfig - Stream configuration from database
   * @param instanceId - Instance ID this stream belongs to
   * @param instanceDb - Database client for this instance
   */
  async registerStream(streamConfig: any, instanceId: string, instanceDb: PrismaClient): Promise<void> {
    const { streamId, adapterType, config: adapterConfig, schedule } = streamConfig;

    console.log(`Registering stream: ${streamId} (${adapterType}) for instance: ${instanceId}`);
    console.log(`Adapter config:`, JSON.stringify(adapterConfig, null, 2));

    // Create adapter instance based on type
    const adapter = this.createAdapter(streamId, adapterType, adapterConfig, instanceId, instanceDb);

    if (!adapter) {
      throw new Error(`Unknown adapter type: ${adapterType}`);
    }

    // Validate and initialize adapter configuration
    const isValid = adapter.validateConfig(adapterConfig);
    if (!isValid) {
      throw new Error(`Invalid configuration for stream ${streamId}`);
    }

    // Initialize the adapter
    await adapter.initialize(adapterConfig);

    // Store adapter
    this.adapters.set(streamId, adapter);

    // Set up scheduled job if schedule is provided
    if (schedule && this.config.enableScheduling) {
      this.scheduleStream(streamId, schedule);
    }

    console.log(`Stream ${streamId} registered successfully for instance ${instanceId}`);
  }

  /**
   * Create an adapter instance based on type
   */
  private createAdapter(
    streamId: string,
    adapterType: string,
    adapterConfig: any,
    instanceId: string,
    instanceDb: PrismaClient
  ): StreamAdapter | null {
    switch (adapterType) {
      case 'csv':
        return new CsvFileAdapter(streamId, instanceDb);

      case 'telegram-bot':
        return new TelegramBotAdapter(streamId, instanceDb);

      // Add more adapter types here as they're implemented
      // case 'discord':
      //   return new DiscordAdapter(streamId, instanceDb);
      // case 'slack':
      //   return new SlackAdapter(streamId, instanceDb);

      default:
        return null;
    }
  }

  /**
   * Schedule a stream to run on a cron schedule
   */
  private scheduleStream(streamId: string, cronSchedule: string): void {
    console.log(`Scheduling stream ${streamId} with schedule: ${cronSchedule}`);

    try {
      const job = cron.schedule(
        cronSchedule,
        async () => {
          await this.runStream(streamId);
        },
        {
          scheduled: true,
          timezone: 'UTC'
        }
      );

      this.jobs.set(streamId, job);
      console.log(`Stream ${streamId} scheduled successfully`);
    } catch (error) {
      console.error(`Failed to schedule stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Import messages from a stream without processing
   */
  async importStream(streamId: string, batchSize?: number): Promise<number> {
    const adapter = this.adapters.get(streamId);
    if (!adapter) {
      throw new Error(`Stream ${streamId} not found`);
    }

    console.log(`\n=== Importing from stream: ${streamId} ===`);

    // Get current watermark
    const watermark = await adapter.getWatermark();
    console.log(`Current watermark:`, watermark);

    // Fetch new messages (this already saves them to the database)
    const messages = await adapter.fetchMessages(
      watermark,
      batchSize || this.config.defaultBatchSize
    );

    if (messages.length === 0) {
      console.log(`No new messages for stream ${streamId}`);
      return 0;
    }

    console.log(`Imported ${messages.length} new messages from ${streamId} (not yet processed)`);

    // Update watermark after successful import
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      await adapter.updateWatermark(
        lastMessage.timestamp,
        lastMessage.messageId,
        messages.length
      );
    }

    return messages.length;
  }

  /**
   * Run a single stream (fetch and process messages)
   */
  async runStream(streamId: string, batchSize?: number): Promise<void> {
    // Check concurrency limit
    if (this.runningStreams.size >= this.config.maxConcurrentStreams) {
      console.warn(`Max concurrent streams reached (${this.config.maxConcurrentStreams}). Skipping ${streamId}`);
      return;
    }

    // Check if stream is already running
    if (this.runningStreams.has(streamId)) {
      console.warn(`Stream ${streamId} is already running. Skipping.`);
      return;
    }

    const adapter = this.adapters.get(streamId);
    if (!adapter) {
      console.error(`Stream ${streamId} not found`);
      return;
    }

    this.runningStreams.add(streamId);

    try {
      console.log(`\n=== Running stream: ${streamId} ===`);

      // Get current watermark
      const watermark = await adapter.getWatermark();
      console.log(`Current watermark:`, watermark);

      // Fetch new messages
      const messages = await adapter.fetchMessages(
        watermark,
        batchSize || this.config.defaultBatchSize
      );

      if (messages.length === 0) {
        console.log(`No new messages for stream ${streamId}`);
        return;
      }

      console.log(`Fetched ${messages.length} new messages from ${streamId}`);

      // Messages are now stored in database as PENDING
      // They will be processed in 24-hour batches by the batch processor
      console.log(`\n=== Stream ${streamId} import complete ===`);
      console.log(`Messages imported: ${messages.length}`);
      console.log(`Status: PENDING (will be processed in next batch run)\n`);

      // Update watermark after successful processing
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        await adapter.updateWatermark(
          lastMessage.timestamp,
          lastMessage.messageId,
          messages.length
        );
      }

    } catch (error: any) {
      console.error(`Error running stream ${streamId}:`, error);

      // Retry logic
      await this.handleStreamError(streamId, error);
    } finally {
      this.runningStreams.delete(streamId);
    }
  }

  /**
   * Handle stream errors with retry logic
   */
  private async handleStreamError(streamId: string, error: Error): Promise<void> {
    console.error(`Stream ${streamId} encountered error:`, error.message);
    console.log(`Error will be logged but stream will continue on next trigger`);

    // Disable stream after error for manual intervention
    await prisma.streamConfig.update({
      where: {
        streamId,
      },
      data: {
        enabled: false,
        metadata: {
          disabledReason: 'Error during processing',
          disabledAt: new Date(),
          lastError: error.message,
        },
      },
    });

    console.log(`Stream ${streamId} disabled. Re-enable manually after fixing the issue.`);
  }

  /**
   * Run all registered streams once
   */
  async runAllStreams(): Promise<void> {
    console.log(`Running all ${this.adapters.size} streams...`);

    const streamIds = Array.from(this.adapters.keys());

    for (const streamId of streamIds) {
      await this.runStream(streamId);
    }

    console.log('All streams completed');
  }

  /**
   * Get health status for all streams
   */
  async getHealth(): Promise<StreamHealth[]> {
    const health: StreamHealth[] = [];

    for (const [streamId, adapter] of this.adapters.entries()) {
      try {
        const watermark = await adapter.getWatermark();
        const metadata = watermark.metadata as any;

        health.push({
          streamId,
          isHealthy: !metadata?.lastError || Date.now() - new Date(metadata.lastErrorTime).getTime() > 3600000, // 1 hour
          lastSuccessfulRun: watermark.lastProcessedTime,
          lastError: metadata?.lastError || null,
          totalProcessed: watermark.totalProcessed,
          errorCount: metadata?.errorCount || 0,
        });
      } catch (error: any) {
        health.push({
          streamId,
          isHealthy: false,
          lastSuccessfulRun: null,
          lastError: error.message,
          totalProcessed: 0,
          errorCount: 0,
        });
      }
    }

    return health;
  }

  /**
   * Get overall statistics
   */
  async getStats(): Promise<{
    totalStreams: number;
    activeStreams: number;
    runningStreams: number;
    scheduledStreams: number;
    totalMessagesProcessed: number;
  }> {
    const watermarks = await prisma.streamWatermark.findMany();

    const totalMessagesProcessed = watermarks.reduce(
      (sum, w) => sum + w.totalProcessed,
      0
    );

    return {
      totalStreams: this.adapters.size,
      activeStreams: this.adapters.size,
      runningStreams: this.runningStreams.size,
      scheduledStreams: this.jobs.size,
      totalMessagesProcessed,
    };
  }

  /**
   * Stop a scheduled stream
   */
  stopStream(streamId: string): void {
    const job = this.jobs.get(streamId);
    if (job) {
      job.stop();
      this.jobs.delete(streamId);
      console.log(`Stream ${streamId} stopped`);
    }
  }

  /**
   * Unregister a stream completely
   */
  async unregisterStream(streamId: string): Promise<void> {
    this.stopStream(streamId);

    const adapter = this.adapters.get(streamId);
    if (adapter) {
      await adapter.cleanup();
      this.adapters.delete(streamId);
      console.log(`Stream ${streamId} unregistered`);
    }
  }

  /**
   * Shutdown the stream manager
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down StreamManager...');

    // Stop all jobs
    for (const [streamId, job] of this.jobs.entries()) {
      job.stop();
      console.log(`Stopped job for ${streamId}`);
    }

    // Cleanup all adapters
    for (const [streamId, adapter] of this.adapters.entries()) {
      await adapter.cleanup();
      console.log(`Cleaned up adapter for ${streamId}`);
    }

    this.jobs.clear();
    this.adapters.clear();
    this.runningStreams.clear();

    console.log('StreamManager shutdown complete');
  }

  /**
   * Get all registered adapters
   * Useful for webhook endpoints to access bot instances
   */
  getAdapters(): Map<string, StreamAdapter> {
    return this.adapters;
  }

  /**
   * Get a specific adapter by streamId
   */
  getAdapter(streamId: string): StreamAdapter | undefined {
    return this.adapters.get(streamId);
  }
}

// Export singleton instance
export const streamManager = new StreamManager();
