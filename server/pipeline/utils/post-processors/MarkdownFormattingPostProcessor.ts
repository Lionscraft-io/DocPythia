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

    // Fix 0a: Bold markers split from their content by newlines (opening)
    // Pattern: **\n\nText:** -> **Text:**
    // e.g., "**\n\nEnable Debug Pages:**" -> "**Enable Debug Pages:**"
    result = result.replace(/\*\*\s*\n+\s*([^*\n]+):\*\*/g, '**$1:**');

    // Fix 0b: Bold markers split from content (without trailing colon)
    // Pattern: **\n\nText** -> **Text**
    result = result.replace(/\*\*\s*\n+\s*([^*\n]+)\*\*/g, '**$1**');

    // Fix 0c: Orphaned ** at start of line followed by content with closing **
    // Pattern: "- **\n\nCommission**:" -> "- **Commission**:"
    result = result.replace(/(-\s*)\*\*\s*\n+\s*([^*\n]+)\*\*(:?)/g, '$1**$2**$3');

    // Fix 0d: Bold with extra newlines before closing colon
    // Pattern: "**Text**\n\n:" -> "**Text:**"
    result = result.replace(/\*\*([^*]+)\*\*\s*\n+\s*:/g, '**$1:**');

    // Fix 0e: Standalone ** followed by newlines then text ending with :**
    // Pattern: "**\n\nCause:**" -> "**Cause:**"
    // Also handles mid-sentence: ". **\n\nSolution:**" -> ". **Solution:**"
    // Run multiple passes to catch all occurrences
    let prevResult = '';
    while (prevResult !== result) {
      prevResult = result;
      // Match ** followed by newlines, then word characters, then :**
      result = result.replace(/\*\*[\s\n]+([A-Za-z][A-Za-z0-9\s]*):\*\*/g, '**$1:**');
    }

    // Fix 0f: Run the fix 0a again to catch any remaining patterns after other fixes
    result = result.replace(/\*\*\s*\n+\s*([^*\n]+):\*\*/g, '**$1:**');

    // Fix 0g: Backtick-enclosed words broken across lines
    // Pattern: `Shadow\nValidator` -> `ShadowValidator`
    // e.g., "Troubleshooting `Shadow\nValidator` Standby" -> "Troubleshooting `ShadowValidator` Standby"
    result = result.replace(/`([A-Za-z]+)\n+([A-Za-z]+)`/g, '`$1$2`');

    // Fix 0h: REMOVED - was too aggressive and stripped legitimate newlines
    // The fix for compound words broken across lines is now handled entirely by Fix 0i
    // which uses explicit known patterns (MacOS, NearBlocks, etc.) instead of heuristics

    // Fix 0i: Simpler approach for known broken compound words
    // Direct replacements for common patterns
    result = result.replace(/Mac\s*\n\s*OS/g, 'MacOS');
    result = result.replace(/Near\s*\n\s*Blocks/g, 'NearBlocks');
    result = result.replace(/Java\s*\n\s*Script/g, 'JavaScript');
    result = result.replace(/Git\s*\n\s*Hub/g, 'GitHub');
    result = result.replace(/Type\s*\n\s*Script/g, 'TypeScript');

    // Fix 0j: Protect known compound words from Fix 1a splitting
    // These are CamelCase words that should NOT be split at lowercase->uppercase boundaries
    const PROTECTED_COMPOUND_WORDS = [
      // Databases
      'RocksDB',
      'LevelDB',
      'PostgreSQL',
      'MySQL',
      'MongoDB',
      'CouchDB',
      'DynamoDB',
      'SQLite',
      // Languages/Frameworks
      'JavaScript',
      'TypeScript',
      'WebAssembly',
      'NodeJS',
      'NextJS',
      'ReactJS',
      'VueJS',
      // Platforms
      'GitHub',
      'GitLab',
      'BitBucket',
      'YouTube',
      'LinkedIn',
      'CloudFlare',
      'CloudFront',
      // Operating Systems
      'MacOS',
      'iOS',
      'iPadOS',
      'tvOS',
      'watchOS',
      'FreeBSD',
      'OpenBSD',
      // NEAR-specific
      'FastNear',
      'NearBlocks',
      'TestNet',
      'MainNet',
      'DevNet',
      'BetaNet',
      'LocalNet',
      // NEAR technical terms
      'FlatStorage',
      'FlatStorageBlockNotSupported',
      'StateSync',
      'EpochSync',
      'BlockSync',
      'ChunkValidator',
      'ShadowValidator',
      'MemTrie',
      // DevOps/Cloud
      'DevOps',
      'WebSocket',
      'WebSockets',
      // AI
      'OpenAI',
      'ChatGPT',
    ];

    // Create placeholders for protected words
    const placeholderMap = new Map<string, string>();
    for (const word of PROTECTED_COMPOUND_WORDS) {
      const placeholder = `__PROTECTED_${word.toUpperCase()}__`;
      placeholderMap.set(word, placeholder);
      // Case-insensitive replacement to placeholder
      result = result.replace(new RegExp(word, 'g'), placeholder);
    }

    // Fix 1a: Add line break after markdown headers that run into text
    // e.g., "## ConsiderationsThe text" -> "## Considerations\n\nThe text"
    // Matches lowercase followed by uppercase within header lines (indicating missing space/newline)
    result = result.replace(/(#{1,6}\s[^\n]*?)([a-z])([A-Z])/gm, '$1$2\n\n$3');

    // Restore protected words from placeholders
    for (const [word, placeholder] of placeholderMap) {
      result = result.replace(new RegExp(placeholder, 'g'), word);
    }

    // Fix 1b: Add line break after bold/italic headers that run into text
    // e.g., "***Title***Cause:" -> "***Title***\n\nCause:"
    // Use non-greedy +? to avoid matching across multiple ** pairs
    // Also require no leading space after ** (to avoid matching " text **")
    result = result.replace(/(\*{2,3}[^\s*][^*\n]*?\*{2,3})([A-Z])/g, '$1\n\n$2');

    // Fix 1c: Add line break after bold headers ending with colon that run into text
    // e.g., "**Title:**While" -> "**Title:**\n\nWhile"
    result = result.replace(/(\*{2,3}[^\s*][^*\n]*?:\*{2,3})([A-Z])/g, '$1\n\n$2');

    // Fix 1d: Add line break after admonition syntax running into text
    // e.g., ":::note Title:::For macOS" -> ":::note Title:::\n\nFor macOS"
    result = result.replace(/(:::[a-z]+[^:]*:::)([A-Z])/gi, '$1\n\n$2');

    // Fix 1e: Add line break after common section titles running into text
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

    // Fix 2b: Handle labels with no space after colon at start
    // e.g., "Cause:The errors..." -> "Cause:\n\nThe errors..."
    result = result.replace(
      /^((?:Cause|Solution|Note|Warning|Important|Example)):([A-Z])/gim,
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
