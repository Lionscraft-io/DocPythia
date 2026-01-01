/**
 * List Formatting Post-Processor
 *
 * Fixes common list formatting issues in LLM-generated content where
 * numbered or bulleted list items run together without proper line breaks.
 *
 * This is separate from markdown formatting because these issues occur
 * regardless of whether the content is markdown - it's an LLM output
 * structure problem, not a markdown syntax problem.
 *
 * @author Wayne
 * @created 2026-01-01
 */

import { BasePostProcessor, PostProcessResult, PostProcessContext } from './types.js';

/**
 * List Formatting Post-Processor
 *
 * Handles cases where LLM generates lists without proper line breaks:
 * - "item 1)2. Item 2" -> "item 1)\n\n2. Item 2"
 * - "Step5. Next step" -> "Step\n\n5. Next step"
 * - "end)- bullet" -> "end)\n\n- bullet"
 */
export class ListFormattingPostProcessor extends BasePostProcessor {
  readonly name = 'list-formatting';
  readonly description = 'Fixes numbered and bulleted list items that run together';

  /**
   * Process all text files (not just markdown)
   */
  shouldProcess(_context: PostProcessContext): boolean {
    return true; // Process all file types
  }

  /**
   * Process the text - fix list formatting
   */
  process(text: string, _context: PostProcessContext): PostProcessResult {
    if (!text) {
      return { text: '', warnings: [], wasModified: false };
    }

    const originalText = text;
    let result = text;

    // Fix 0: Convert literal \n strings to actual newlines
    // LLM sometimes generates escaped \n instead of actual newlines
    result = result.replace(/\\n/g, '\n');

    // Fix 1: Numbered list after closing paren
    // e.g., "migration)2. Finding" -> "migration)\n\n2. Finding"
    result = result.replace(/(\))(\d+\.\s*\*{0,2}\s*[A-Z])/g, '$1\n\n$2');

    // Fix 2: Numbered list after punctuation (period, exclamation, question)
    // e.g., "directory.2. Check" -> "directory.\n\n2. Check"
    // Handles optional bold markers: "directory.2. **Check"
    result = result.replace(/([.!?])(\d+\.\s*\*{0,2}\s*[A-Z])/g, '$1\n\n$2');

    // Fix 3: Word directly followed by number (no punctuation)
    // e.g., "Sync5. Download" -> "Sync\n\n5. Download"
    result = result.replace(/([a-z])(\d+\.\s+[A-Z])/g, '$1\n\n$2');

    // Fix 4: Dash/bullet after closing paren
    // e.g., "Phase)- During" -> "Phase)\n\n- During"
    result = result.replace(/(\))(-\s+[A-Z])/g, '$1\n\n$2');

    // Fix 5: Dash/bullet after punctuation
    // e.g., "nodes.- Data" -> "nodes.\n\n- Data"
    result = result.replace(/([.!?])(-\s+[A-Z])/g, '$1\n\n$2');

    // Fix 6: Colon followed by numbered list
    // e.g., "Solution:1." -> "Solution:\n\n1."
    result = result.replace(/(:)(\d+\.)/g, '$1\n\n$2');

    // Fix 7: Colon followed by bullet
    // e.g., "options:- First" -> "options:\n\n- First"
    result = result.replace(/(:)(-\s+[A-Z])/g, '$1\n\n$2');

    // Fix 8: Colon followed by asterisk bullet
    // e.g., "contribute:* Network" -> "contribute:\n\n* Network"
    result = result.replace(/(:)(\s*\*\s+)/g, '$1\n\n$2');

    // Fix 9: Asterisk bullet after backtick-quoted code
    // e.g., "`state_sync`* `next`" -> "`state_sync`\n\n* `next`"
    result = result.replace(/(`)\*\s+`/g, '$1\n\n* `');

    // Fix 10: Asterisk bullet running into previous text (generic)
    // e.g., "enabled`* item" -> "enabled`\n\n* item"
    result = result.replace(/([`'"])\*\s+/g, '$1\n\n* ');

    // Fix 11: Asterisk bullet after sentence ending (with multiple spaces)
    // e.g., "execution. *   **Operating" -> "execution.\n\n*   **Operating"
    result = result.replace(/([.!?])\s+(\*\s{2,}\*{0,2}[A-Z])/g, '$1\n\n$2');

    // Fix 12: Asterisk bullet after sentence ending (with single space)
    // e.g., "execution. * Check" -> "execution.\n\n* Check"
    result = result.replace(/([.!?])\s+(\*\s[A-Z])/g, '$1\n\n$2');

    // Fix 13: Clean up excessive newlines (more than 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    const wasModified = result !== originalText;

    return {
      text: result,
      warnings: [],
      wasModified,
    };
  }
}
