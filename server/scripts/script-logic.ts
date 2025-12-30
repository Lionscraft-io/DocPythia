/**
 * Script Logic Module
 *
 * Extracted logic from CLI scripts for testability.
 * The CLI entry points (analyze-messages.ts, full-scrape.ts) use these functions.
 */

import { createAnalyzerFromEnv } from '../analyzer/gemini-analyzer';
import { createZulipchatScraperFromEnv } from '../scraper/zulipchat';
import { storage } from '../storage';

export interface AnalyzeMessagesOptions {
  limit: number;
}

export interface AnalyzeMessagesResult {
  success: boolean;
  analyzed: number;
  relevant: number;
  updatesCreated: number;
  remaining: number;
  error?: string;
}

export interface FullScrapeOptions {
  channelName: string;
  batchSize: number;
}

export interface FullScrapeResult {
  success: boolean;
  totalMessages: number;
  error?: string;
}

/**
 * Core logic for analyzing messages
 */
export async function runAnalyzeMessages(
  options: AnalyzeMessagesOptions
): Promise<AnalyzeMessagesResult> {
  const { limit } = options;

  const analyzer = createAnalyzerFromEnv();

  if (!analyzer) {
    return {
      success: false,
      analyzed: 0,
      relevant: 0,
      updatesCreated: 0,
      remaining: 0,
      error: 'Gemini API key not configured. Please set GEMINI_API_KEY environment variable.',
    };
  }

  // Check how many unanalyzed messages we have
  const unanalyzed = await storage.getUnanalyzedMessages();

  try {
    const result = await analyzer.analyzeUnanalyzedMessages(limit);
    const remaining = await storage.getUnanalyzedMessages();

    return {
      success: true,
      analyzed: result.analyzed,
      relevant: result.relevant,
      updatesCreated: result.updatesCreated,
      remaining: remaining.length,
    };
  } catch (error: any) {
    return {
      success: false,
      analyzed: 0,
      relevant: 0,
      updatesCreated: 0,
      remaining: unanalyzed.length,
      error: error.message,
    };
  }
}

/**
 * Core logic for full scrape
 */
export async function runFullScrape(options: FullScrapeOptions): Promise<FullScrapeResult> {
  const { channelName, batchSize } = options;

  const scraper = createZulipchatScraperFromEnv();

  if (!scraper) {
    return {
      success: false,
      totalMessages: 0,
      error:
        'Zulipchat credentials not configured. Please set ZULIP_BOT_EMAIL and ZULIP_API_KEY environment variables.',
    };
  }

  const connected = await scraper.testConnection();

  if (!connected) {
    return {
      success: false,
      totalMessages: 0,
      error:
        'Could not connect to Zulipchat. Please check your credentials and network connection.',
    };
  }

  try {
    const totalMessages = await scraper.performFullScrape(channelName, batchSize);

    return {
      success: true,
      totalMessages,
    };
  } catch (error: any) {
    return {
      success: false,
      totalMessages: 0,
      error: error.message,
    };
  }
}

/**
 * Parse analyze-messages command line arguments
 */
export function parseAnalyzeMessagesArgs(argv: string[]): AnalyzeMessagesOptions {
  const limit = parseInt(argv[2] || '100', 10);
  return { limit };
}

/**
 * Parse full-scrape command line arguments
 */
export function parseFullScrapeArgs(argv: string[], env: NodeJS.ProcessEnv): FullScrapeOptions {
  const channelName = argv[2] || env.ZULIP_CHANNEL || 'community-support';
  const batchSize = parseInt(argv[3] || '1000', 10);
  return { channelName, batchSize };
}

/**
 * Format console output header box
 */
export function formatHeader(title: string): string {
  const width = 50;
  const top = '╔' + '═'.repeat(width - 2) + '╗';
  const paddedTitle = title.padStart(Math.floor((width - 2 + title.length) / 2)).padEnd(width - 2);
  const middle = '║' + paddedTitle + '║';
  const bottom = '╚' + '═'.repeat(width - 2) + '╝';
  return `${top}\n${middle}\n${bottom}`;
}

/**
 * Get the project name from environment or default
 */
export function getProjectName(): string {
  return process.env.PROJECT_NAME || 'DocsAI';
}
