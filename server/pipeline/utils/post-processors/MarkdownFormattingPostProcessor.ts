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

import {
  BasePostProcessor,
  PostProcessResult,
  PostProcessContext,
  maskCodeSegments,
  unmaskCodeSegments,
} from './types.js';

/**
 * Common sentence starters and labels that indicate the start of new content.
 * Used to distinguish formatting errors from valid CamelCase identifiers.
 *
 * Examples:
 * - "## ConsiderationsThe text" → split ("The" is sentence starter)
 * - "## JavaScript runtime" → no split ("Script" is not sentence starter)
 * - "## RocksDB internals" → no split (DB is uppercase, pattern doesn't match)
 */
const SENTENCE_STARTERS = new Set([
  // Articles and determiners
  'the',
  'a',
  'an',
  'this',
  'that',
  'these',
  'those',
  'some',
  'any',
  'all',
  'each',
  'every',
  'no',
  // Pronouns
  'it',
  'its',
  'we',
  'you',
  'they',
  'he',
  'she',
  'i',
  'my',
  'your',
  'our',
  'their',
  // Common sentence-starting verbs
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'can',
  'may',
  'might',
  'must',
  'use',
  'run',
  'check',
  'try',
  'make',
  'see',
  'note',
  'ensure',
  'verify',
  'confirm',
  'add',
  'remove',
  'create',
  'delete',
  'update',
  'set',
  'get',
  'start',
  'stop',
  'open',
  'close',
  'install',
  'configure',
  'enable',
  'disable',
  // Prepositions often starting sentences
  'for',
  'from',
  'to',
  'in',
  'on',
  'at',
  'by',
  'with',
  'about',
  'into',
  'onto',
  'upon',
  'during',
  'after',
  'before',
  // Conjunctions and transitions
  'if',
  'when',
  'while',
  'unless',
  'although',
  'though',
  'once',
  'since',
  'because',
  'but',
  'and',
  'or',
  'so',
  'yet',
  'nor',
  'however',
  'therefore',
  'thus',
  'hence',
  'also',
  'additionally',
  'furthermore',
  'moreover',
  'otherwise',
  'then',
  'next',
  'first',
  'second',
  'third',
  'finally',
  'lastly',
  'now',
  'here',
  'there',
  // Adverbs
  'just',
  'only',
  'even',
  'still',
  'already',
  'always',
  'never',
  'often',
  'sometimes',
  // Common documentation labels
  'cause',
  'solution',
  'note',
  'warning',
  'important',
  'example',
  'error',
  'issue',
  'problem',
  'fix',
  'resolution',
  'answer',
  'question',
  'tip',
  'info',
  'details',
  'summary',
  'overview',
  'background',
  'context',
  'result',
  'output',
  'input',
  'step',
  'steps',
  'action',
  'description',
  'reason',
  'explanation',
  'requirement',
  'requirements',
]);

/**
 * Check if a word is a common sentence starter
 */
function isSentenceStarter(word: string): boolean {
  return SENTENCE_STARTERS.has(word.toLowerCase());
}

/**
 * High-confidence sentence starters for boundary detection.
 * Smaller allowlist than SENTENCE_STARTERS to avoid false positives
 * when fixing sentence run-on issues (e.g., `.Word` -> `. Word`).
 */
const SENTENCE_BOUNDARY_STARTERS = new Set([
  'the',
  'this',
  'that',
  'if',
  'when',
  'while',
  'for',
  'to',
  'in',
  'on',
  'at',
  'as',
  'we',
  'you',
  'it',
  'they',
  'there',
  'however',
  'therefore',
  'also',
  'but',
  'or',
  'and',
  'please',
  'note',
  'ensure',
  'see',
  'refer',
  'check',
  'use',
  'after',
  'before',
]);

/**
 * Check if a word is a high-confidence sentence boundary starter
 */
function isSentenceBoundaryStarter(word: string): boolean {
  return SENTENCE_BOUNDARY_STARTERS.has(word.toLowerCase());
}

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

    // Fix 0i: Simpler approach for known broken compound words
    // Direct replacements for common patterns where LLM inserts newlines mid-word
    result = result.replace(/Mac\s*\n\s*OS/g, 'MacOS');
    result = result.replace(/Near\s*\n\s*Blocks/g, 'NearBlocks');
    result = result.replace(/Java\s*\n\s*Script/g, 'JavaScript');
    result = result.replace(/Git\s*\n\s*Hub/g, 'GitHub');
    result = result.replace(/Type\s*\n\s*Script/g, 'TypeScript');

    // Fix 1a: Add line break after markdown headers that run into text
    // e.g., "## ConsiderationsThe text" -> "## Considerations\n\nThe text"
    //
    // Key insight: Only split when the uppercase word is a SENTENCE STARTER.
    // This distinguishes formatting errors from valid CamelCase identifiers:
    // - "## ConsiderationsThe text" → split ("The" is sentence starter)
    // - "## JavaScript runtime" → no split ("Script" is not sentence starter)
    // - "## RocksDB internals" → no split (pattern requires lowercase after uppercase)
    //
    // Process each line individually to handle multiple CamelCase boundaries
    // e.g., "### TestNet DeploymentFor testing" has two boundaries (tNet, tFor)
    // We skip tNet (not sentence starter) and split at tFor
    result = result
      .split('\n')
      .map((line) => {
        // Only process header lines
        if (!/^#{1,6}\s/.test(line)) {
          return line;
        }

        // Find ALL CamelCase boundaries and split at sentence starters
        // Pattern: lowercase followed by uppercase+lowercase (potential word start)
        const boundaryPattern = /([a-z])([A-Z][a-z]+)/g;
        let match;
        let lastIndex = 0;
        let processedLine = '';

        while ((match = boundaryPattern.exec(line)) !== null) {
          const [, , upper] = match;
          const matchStart = match.index;

          // Add everything before this match
          processedLine += line.slice(lastIndex, matchStart + 1); // Include the lowercase letter

          // Check if this uppercase word is a sentence starter
          if (isSentenceStarter(upper)) {
            processedLine += '\n\n' + upper;
          } else {
            processedLine += upper;
          }

          lastIndex = matchStart + 1 + upper.length;
        }

        // Add any remaining content after the last match
        processedLine += line.slice(lastIndex);

        return processedLine;
      })
      .join('\n');

    // Fix 1b: Add line break after bold/italic headers that run into text
    // e.g., "***Title***Cause:" -> "***Title***\n\nCause:"
    // Only split when followed by a sentence starter
    result = result.replace(
      /(\*{2,3}[^\s*][^*\n]*?\*{2,3})([A-Z][a-z]+)/g,
      (match, bold, upper) => {
        if (isSentenceStarter(upper)) {
          return `${bold}\n\n${upper}`;
        }
        return match;
      }
    );

    // Fix 1c: Add line break after bold headers ending with colon that run into text
    // e.g., "**Title:**While" -> "**Title:**\n\nWhile"
    // Colons indicate content follows, so we can be more aggressive here
    result = result.replace(/(\*{2,3}[^\s*][^*\n]*?:\*{2,3})([A-Z])/g, '$1\n\n$2');

    // Fix 1d: Add line break after admonition syntax running into text
    // e.g., ":::note Title:::For macOS" -> ":::note Title:::\n\nFor macOS"
    // Only split when followed by a sentence starter
    result = result.replace(/(:::[a-z]+[^:]*:::)([A-Z][a-z]+)/gi, (match, admonition, upper) => {
      if (isSentenceStarter(upper)) {
        return `${admonition}\n\n${upper}`;
      }
      return match;
    });

    // Fix 1e: Add line break after common section titles running into text
    // e.g., "TroubleshootingIf you" -> "Troubleshooting\n\nIf you"
    // Only split when followed by a sentence starter
    result = result.replace(
      /\b(Troubleshooting|Overview|Prerequisites|Installation|Configuration|Usage|Examples?|Summary|Conclusion|Introduction|Background|Requirements|Setup|Notes?|Tips?|Warnings?|Errors?|Solutions?|Steps|Instructions)([A-Z][a-z]+)/g,
      (match, title, upper) => {
        if (isSentenceStarter(upper)) {
          return `${title}\n\n${upper}`;
        }
        return match;
      }
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

    // === NEW FIXES: Apply with code masking to avoid modifying code blocks ===
    const masked = maskCodeSegments(result);

    // Fix 6: Sentence run-on after period (missing space)
    // e.g., "FastNear.Please refer" -> "FastNear. Please refer"
    // Only when followed by allowlisted sentence boundary starter + word boundary
    // Guard: requires lowercase before period (excludes versions like 1.0.0)
    masked.text = masked.text.replace(/([a-z])\.([A-Z][a-z]+)\b/g, (match, prevChar, nextWord) => {
      if (isSentenceBoundaryStarter(nextWord)) {
        return `${prevChar}. ${nextWord}`;
      }
      return match;
    });

    // Fix 7: Missing space after markdown link
    // e.g., "](url)This" -> "](url) This"
    // Insert space when link followed by alphanumeric or opening quote/paren
    masked.text = masked.text.replace(/(\]\([^)]+\))([A-Za-z0-9("'"])/g, '$1 $2');

    // Fix 8: Period before bold (missing space)
    // e.g., "available.**As of" -> "available. **As of"
    // Guard: lowercase letter before period to avoid list items like "1.**Bold**"
    masked.text = masked.text.replace(/([a-z])\.(\*{2,3}[A-Z])/g, '$1. $2');

    // Restore code segments
    result = unmaskCodeSegments(masked);

    // Fix 9: Trailing separator garbage (end of text only)
    // e.g., "content\n========" -> "content"
    // Only at end to preserve setext headings mid-document
    result = result.replace(/\n*={4,}\n*$/g, '');

    // Fix 10: Clean up excessive newlines (more than 2 consecutive)
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

// Export for testing
export {
  isSentenceStarter,
  isSentenceBoundaryStarter,
  SENTENCE_STARTERS,
  SENTENCE_BOUNDARY_STARTERS,
};
