/**
 * Markdown Formatting Post-Processor
 *
 * Fixes markdown-specific formatting issues in LLM-generated content:
 * - Bold/italic headers running into text
 * - Admonition syntax issues
 * - Section titles without proper breaks
 * - Labels (Cause:, Solution:) at content boundaries
 *
 * Note: List formatting issues are handled by ListFormattingPostProcessor.
 *
 * @author Wayne
 * @created 2025-12-31
 */

import { BasePostProcessor, PostProcessResult, PostProcessContext } from './types.js';

/**
 * Markdown Formatting Post-Processor
 */
export class MarkdownFormattingPostProcessor extends BasePostProcessor {
  readonly name = 'markdown-formatting';
  readonly description = 'Fixes markdown-specific formatting issues like headers and admonitions';

  /**
   * Only process markdown files
   */
  shouldProcess(context: PostProcessContext): boolean {
    return context.isMarkdown;
  }

  /**
   * Process the text - fix markdown formatting
   */
  process(text: string, _context: PostProcessContext): PostProcessResult {
    if (!text) {
      return { text: '', warnings: [], wasModified: false };
    }

    const originalText = text;
    let result = text;

    // Fix 1a: Add line break after markdown headers that run into text
    // e.g., "## ConsiderationsThe text" -> "## Considerations\n\nThe text"
    // Matches lowercase followed by uppercase within header lines (indicating missing space/newline)
    result = result.replace(/(#{1,6}\s[^\n]*?)([a-z])([A-Z])/gm, '$1$2\n\n$3');

    // Fix 1b: Add line break after bold/italic headers that run into text
    // e.g., "***Title***Cause:" -> "***Title***\n\nCause:"
    result = result.replace(/(\*{2,3}[^*\n]+\*{2,3})([A-Z])/g, '$1\n\n$2');

    // Fix 1b: Add line break after bold headers ending with colon that run into text
    // e.g., "**Title:**While" -> "**Title:**\n\nWhile"
    result = result.replace(/(\*{2,3}[^*\n]+:\*{2,3})([A-Z])/g, '$1\n\n$2');

    // Fix 1c: Add line break after admonition syntax running into text
    // e.g., ":::note Title:::For macOS" -> ":::note Title:::\n\nFor macOS"
    result = result.replace(/(:::[a-z]+[^:]*:::)([A-Z])/gi, '$1\n\n$2');

    // Fix 1d: Add line break after common section titles running into text
    // e.g., "TroubleshootingIf you" -> "Troubleshooting\n\nIf you"
    result = result.replace(
      /\b(Troubleshooting|Overview|Prerequisites|Installation|Configuration|Usage|Examples?|Summary|Conclusion|Introduction|Background|Requirements|Setup|Notes?|Tips?|Warnings?|Errors?|Solutions?|Steps|Instructions)([A-Z][a-z])/g,
      '$1\n\n$2'
    );

    // Fix 2: Add line break after labels at the very start of content
    // e.g., "Cause: These errors..." -> "Cause:\n\nThese errors..."
    result = result.replace(
      /^((?:Cause|Solution|Note|Warning|Important|Example)):[ \t]+(\S)/gi,
      '$1:\n\n$2'
    );

    // Fix 3: Add line breaks around labels that follow sentence endings
    // e.g., "corrupt state.Solution:1." -> "corrupt state.\n\nSolution:\n\n1."
    // Also handles numbered labels like "Solution 1:" or "Cause 2:"
    // Note: space after punctuation is optional since LLM often omits it
    result = result.replace(
      /([.!?])[ \t]*((?:Cause|Solution|Note|Warning|Important|Example)(?:\s*\d+)?):[ \t]*(\S)/gi,
      '$1\n\n$2:\n\n$3'
    );

    // Fix 3b: Handle labels directly after punctuation (no space)
    // e.g., "occur.Solution:" -> "occur.\n\nSolution:"
    // Also handles "occur.Solution 1:" -> "occur.\n\nSolution 1:"
    result = result.replace(
      /([.!?])((?:Cause|Solution|Note|Warning|Important|Example)(?:\s*\d+)?):(\S)/gi,
      '$1\n\n$2:\n\n$3'
    );

    // Fix 3c: Handle labels after colon (not just .!?)
    // e.g., "following:Cause:" -> "following:\n\nCause:"
    result = result.replace(
      /(:)((?:Cause|Solution|Note|Warning|Important|Example)(?:\s*\d+)?):[ \t]*(\S)/gi,
      '$1\n\n$2:\n\n$3'
    );

    // Fix 4: Clean up excessive newlines (more than 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Fix 5: Trim trailing whitespace on lines
    result = result
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');

    const wasModified = result !== originalText;

    return {
      text: result,
      warnings: [],
      wasModified,
    };
  }
}
