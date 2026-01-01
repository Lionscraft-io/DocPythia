/**
 * Post-Processor Types and Interfaces
 *
 * @author Wayne
 * @created 2025-12-31
 */

/**
 * Result from a single post-processor
 */
export interface PostProcessResult {
  /** The processed text */
  text: string;
  /** Warnings about content that couldn't be auto-processed */
  warnings: string[];
  /** Whether any modification was applied */
  wasModified: boolean;
}

/**
 * Context passed to post-processors
 */
export interface PostProcessContext {
  /** Target file path (e.g., "docs/api/errors.md") */
  targetFilePath: string;
  /** File extension without dot (e.g., "md", "mdx") */
  fileExtension: string;
  /** Whether the target is a markdown file */
  isMarkdown: boolean;
  /** Whether the target is an HTML file */
  isHtml: boolean;
  /** Original text before any processing */
  originalText: string;
  /** Accumulated warnings from previous processors */
  previousWarnings: string[];
}

/**
 * Base interface for all post-processors
 */
export interface IPostProcessor {
  /** Unique identifier for this processor */
  readonly name: string;

  /** Description of what this processor does */
  readonly description: string;

  /** Whether this processor is enabled */
  enabled: boolean;

  /**
   * Check if this processor should run for the given context
   */
  shouldProcess(context: PostProcessContext): boolean;

  /**
   * Process the text and return the result
   */
  process(text: string, context: PostProcessContext): PostProcessResult;
}

/**
 * Abstract base class for post-processors with common functionality
 */
export abstract class BasePostProcessor implements IPostProcessor {
  abstract readonly name: string;
  abstract readonly description: string;
  enabled: boolean = true;

  /**
   * Override to customize when this processor should run
   * Default: only process markdown files
   */
  shouldProcess(context: PostProcessContext): boolean {
    return context.isMarkdown;
  }

  /**
   * Main processing logic - must be implemented by subclasses
   */
  abstract process(text: string, context: PostProcessContext): PostProcessResult;
}
