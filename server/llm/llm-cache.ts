/**
 * LLM Response Cache Service
 * Local file-based caching of LLM requests and responses
 * Author: Wayne
 * Date: 2025-10-30
 * Purpose: Reduce redundant LLM API calls by caching prompt/response pairs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CachePurpose = 'index' | 'embeddings' | 'analysis' | 'changegeneration' | 'review' | 'general';

export interface CachedLLMRequest {
  hash: string;
  purpose: CachePurpose;
  prompt: string;
  response: string;
  timestamp: string;
  model?: string;
  tokensUsed?: number;
  messageId?: number; // Link to UnifiedMessage for grouping related LLM calls
}

export class LLMCache {
  private cacheRootDir: string;
  private enabled: boolean;

  constructor() {
    // Cache directory at project root: /cache/llm/
    this.cacheRootDir = path.join(__dirname, '../../cache/llm');
    this.enabled = process.env.LLM_CACHE_ENABLED !== 'false'; // Enabled by default

    if (this.enabled) {
      this.ensureDirectories();
      console.log('LLM Cache initialized at:', this.cacheRootDir);
    } else {
      console.log('LLM Cache is disabled');
    }
  }

  /**
   * Ensure cache directory structure exists
   */
  private ensureDirectories(): void {
    const purposes: CachePurpose[] = ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];

    // Create root cache directory
    if (!fs.existsSync(this.cacheRootDir)) {
      fs.mkdirSync(this.cacheRootDir, { recursive: true });
    }

    // Create subdirectories for each purpose
    for (const purpose of purposes) {
      const purposeDir = path.join(this.cacheRootDir, purpose);
      if (!fs.existsSync(purposeDir)) {
        fs.mkdirSync(purposeDir, { recursive: true });
      }
    }
  }

  /**
   * Generate hash from prompt for cache key
   */
  private hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  /**
   * Get cache file path for a given prompt and purpose
   */
  private getCacheFilePath(prompt: string, purpose: CachePurpose): string {
    const hash = this.hashPrompt(prompt);
    return path.join(this.cacheRootDir, purpose, `${hash}.json`);
  }

  /**
   * Check if a cached response exists for the given prompt
   */
  has(prompt: string, purpose: CachePurpose): boolean {
    if (!this.enabled) return false;

    const filePath = this.getCacheFilePath(prompt, purpose);
    return fs.existsSync(filePath);
  }

  /**
   * Get cached response for the given prompt
   */
  get(prompt: string, purpose: CachePurpose): CachedLLMRequest | null {
    if (!this.enabled) return null;

    try {
      const filePath = this.getCacheFilePath(prompt, purpose);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const cached = JSON.parse(fileContent) as CachedLLMRequest;

      console.log(`✓ LLM Cache HIT: ${purpose}/${cached.hash.substring(0, 8)}`);
      return cached;
    } catch (error) {
      console.error('Error reading LLM cache:', error);
      return null;
    }
  }

  /**
   * Save LLM request and response to cache
   */
  set(
    prompt: string,
    response: string,
    purpose: CachePurpose,
    metadata?: {
      model?: string;
      tokensUsed?: number;
      messageId?: number;
    }
  ): void {
    console.log(`[DEBUG] llmCache.set() called - enabled: ${this.enabled}, purpose: ${purpose}`);

    if (!this.enabled) {
      console.log(`[DEBUG] Cache is disabled, skipping save`);
      return;
    }

    try {
      const hash = this.hashPrompt(prompt);
      const filePath = this.getCacheFilePath(prompt, purpose);

      console.log(`[DEBUG] Cache file path: ${filePath}`);
      console.log(`[DEBUG] Prompt length: ${prompt.length}, Response length: ${response.length}`);

      const cacheEntry: CachedLLMRequest = {
        hash,
        purpose,
        prompt,
        response,
        timestamp: new Date().toISOString(),
        model: metadata?.model,
        tokensUsed: metadata?.tokensUsed,
        messageId: metadata?.messageId,
      };

      console.log(`[DEBUG] About to write cache file...`);
      fs.writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
      console.log(`✓ LLM Cache SAVED: ${purpose}/${hash.substring(0, 8)} at ${filePath}`);

      // Verify the file was actually written
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`[DEBUG] Cache file written successfully, size: ${stats.size} bytes`);
      } else {
        console.error(`[DEBUG] ERROR: Cache file does not exist after write!`);
      }
    } catch (error) {
      console.error('Error writing LLM cache:', error);
      console.error('[DEBUG] Full error:', error);
    }
  }

  /**
   * Get all cached requests for a specific purpose
   */
  listByPurpose(purpose: CachePurpose): CachedLLMRequest[] {
    if (!this.enabled) return [];

    try {
      const purposeDir = path.join(this.cacheRootDir, purpose);

      if (!fs.existsSync(purposeDir)) {
        return [];
      }

      const files = fs.readdirSync(purposeDir).filter(f => f.endsWith('.json'));
      const cached: CachedLLMRequest[] = [];

      for (const file of files) {
        try {
          const filePath = path.join(purposeDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          cached.push(JSON.parse(fileContent));
        } catch (error) {
          console.error(`Error reading cache file ${file}:`, error);
        }
      }

      // Sort by timestamp descending (newest first)
      cached.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return cached;
    } catch (error) {
      console.error('Error listing cache by purpose:', error);
      return [];
    }
  }

  /**
   * Get all cached requests across all purposes
   */
  listAll(): { purpose: CachePurpose; requests: CachedLLMRequest[] }[] {
    if (!this.enabled) return [];

    const purposes: CachePurpose[] = ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];
    const results: { purpose: CachePurpose; requests: CachedLLMRequest[] }[] = [];

    for (const purpose of purposes) {
      const requests = this.listByPurpose(purpose);
      if (requests.length > 0) {
        results.push({ purpose, requests });
      }
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalCached: number;
    byPurpose: Record<CachePurpose, number>;
    totalSizeBytes: number;
  } {
    if (!this.enabled) {
      return {
        totalCached: 0,
        byPurpose: {
          index: 0,
          embeddings: 0,
          analysis: 0,
          changegeneration: 0,
          review: 0,
          general: 0,
        },
        totalSizeBytes: 0,
      };
    }

    const purposes: CachePurpose[] = ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];
    const byPurpose: Record<CachePurpose, number> = {
      index: 0,
      embeddings: 0,
      analysis: 0,
      changegeneration: 0,
      review: 0,
      general: 0,
    };
    let totalSizeBytes = 0;

    for (const purpose of purposes) {
      const purposeDir = path.join(this.cacheRootDir, purpose);

      if (fs.existsSync(purposeDir)) {
        const files = fs.readdirSync(purposeDir).filter(f => f.endsWith('.json'));
        byPurpose[purpose] = files.length;

        // Calculate total size
        for (const file of files) {
          const filePath = path.join(purposeDir, file);
          try {
            const stats = fs.statSync(filePath);
            totalSizeBytes += stats.size;
          } catch (error) {
            // Ignore errors
          }
        }
      }
    }

    const totalCached = Object.values(byPurpose).reduce((sum, count) => sum + count, 0);

    return {
      totalCached,
      byPurpose,
      totalSizeBytes,
    };
  }

  /**
   * Clear cache for a specific purpose
   */
  clearPurpose(purpose: CachePurpose): number {
    if (!this.enabled) return 0;

    try {
      const purposeDir = path.join(this.cacheRootDir, purpose);

      if (!fs.existsSync(purposeDir)) {
        return 0;
      }

      const files = fs.readdirSync(purposeDir).filter(f => f.endsWith('.json'));
      let deletedCount = 0;

      for (const file of files) {
        try {
          fs.unlinkSync(path.join(purposeDir, file));
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting cache file ${file}:`, error);
        }
      }

      console.log(`Cleared ${deletedCount} cached requests from ${purpose}`);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing cache purpose:', error);
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  clearAll(): number {
    if (!this.enabled) return 0;

    const purposes: CachePurpose[] = ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];
    let totalDeleted = 0;

    for (const purpose of purposes) {
      totalDeleted += this.clearPurpose(purpose);
    }

    console.log(`Cleared total of ${totalDeleted} cached requests`);
    return totalDeleted;
  }

  /**
   * Search cache entries by text in prompt or response
   * @param searchText Text to search for (case-insensitive)
   * @param purpose Optional purpose to filter by
   * @returns Array of matching cache entries
   */
  search(searchText: string, purpose?: CachePurpose): CachedLLMRequest[] {
    if (!this.enabled) return [];

    const results: CachedLLMRequest[] = [];
    const searchLower = searchText.toLowerCase();
    const purposes: CachePurpose[] = purpose
      ? [purpose]
      : ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];

    for (const p of purposes) {
      const purposeDir = path.join(this.cacheRootDir, p);

      if (!fs.existsSync(purposeDir)) {
        continue;
      }

      const files = fs.readdirSync(purposeDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(purposeDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const cached = JSON.parse(fileContent) as CachedLLMRequest;

          // Search in prompt and response
          if (
            cached.prompt.toLowerCase().includes(searchLower) ||
            cached.response.toLowerCase().includes(searchLower)
          ) {
            results.push(cached);
          }
        } catch (error) {
          console.error(`Error processing cache file ${file}:`, error);
        }
      }
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return results;
  }

  /**
   * Find all cache entries related to a specific message ID
   * Returns entries grouped by purpose
   */
  findByMessageId(messageId: number): { purpose: CachePurpose; request: CachedLLMRequest }[] {
    if (!this.enabled) return [];

    const results: { purpose: CachePurpose; request: CachedLLMRequest }[] = [];
    const purposes: CachePurpose[] = ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];

    for (const purpose of purposes) {
      const purposeDir = path.join(this.cacheRootDir, purpose);

      if (!fs.existsSync(purposeDir)) {
        continue;
      }

      const files = fs.readdirSync(purposeDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(purposeDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const cached = JSON.parse(fileContent) as CachedLLMRequest;

          if (cached.messageId === messageId) {
            results.push({ purpose, request: cached });
          }
        } catch (error) {
          console.error(`Error processing cache file ${file}:`, error);
        }
      }
    }

    // Sort by timestamp (earliest first to show processing order)
    results.sort((a, b) => new Date(a.request.timestamp).getTime() - new Date(b.request.timestamp).getTime());

    return results;
  }

  /**
   * Search cache and include all related entries for matching messages
   * This finds cache entries by text search, then also includes all other
   * cache entries for the same messageId across different purposes
   */
  searchWithRelated(searchText: string, purpose?: CachePurpose): {
    messageId: number | null;
    entries: { purpose: CachePurpose; request: CachedLLMRequest }[];
  }[] {
    if (!this.enabled) return [];

    // First, find matching entries
    const searchResults = this.search(searchText, purpose);

    // Group by messageId
    const messageGroups = new Map<number | null, Set<string>>();
    const allEntries = new Map<string, { purpose: CachePurpose; request: CachedLLMRequest }>();

    // Add search results to groups
    for (const result of searchResults) {
      const msgId = result.messageId ?? null;
      if (!messageGroups.has(msgId)) {
        messageGroups.set(msgId, new Set());
      }
      messageGroups.get(msgId)!.add(result.hash);
      allEntries.set(result.hash, { purpose: result.purpose, request: result });
    }

    // For each messageId, find all related entries
    for (const [msgId] of messageGroups) {
      if (msgId !== null) {
        const relatedEntries = this.findByMessageId(msgId);
        for (const entry of relatedEntries) {
          if (!messageGroups.get(msgId)!.has(entry.request.hash)) {
            messageGroups.get(msgId)!.add(entry.request.hash);
            allEntries.set(entry.request.hash, entry);
          }
        }
      }
    }

    // Convert to output format
    const results: {
      messageId: number | null;
      entries: { purpose: CachePurpose; request: CachedLLMRequest }[];
    }[] = [];

    for (const [msgId, hashes] of messageGroups) {
      const entries = Array.from(hashes)
        .map(hash => allEntries.get(hash)!)
        .sort((a, b) => new Date(a.request.timestamp).getTime() - new Date(b.request.timestamp).getTime());

      results.push({
        messageId: msgId,
        entries,
      });
    }

    // Sort by most recent first
    results.sort((a, b) => {
      const aTime = Math.max(...a.entries.map(e => new Date(e.request.timestamp).getTime()));
      const bTime = Math.max(...b.entries.map(e => new Date(e.request.timestamp).getTime()));
      return bTime - aTime;
    });

    return results;
  }

  /**
   * Delete cache entries older than the specified age in days
   */
  clearOlderThan(days: number): number {
    if (!this.enabled) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTime = cutoffDate.getTime();

    const purposes: CachePurpose[] = ['index', 'embeddings', 'analysis', 'changegeneration', 'review', 'general'];
    let deletedCount = 0;

    for (const purpose of purposes) {
      const purposeDir = path.join(this.cacheRootDir, purpose);

      if (!fs.existsSync(purposeDir)) {
        continue;
      }

      const files = fs.readdirSync(purposeDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(purposeDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const cached = JSON.parse(fileContent) as CachedLLMRequest;

          const timestamp = new Date(cached.timestamp).getTime();
          if (timestamp < cutoffTime) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          console.error(`Error processing cache file ${file}:`, error);
        }
      }
    }

    console.log(`Deleted ${deletedCount} cached requests older than ${days} days`);
    return deletedCount;
  }
}

// Export singleton instance
export const llmCache = new LLMCache();
