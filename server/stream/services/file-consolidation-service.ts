/**
 * FileConsolidationService
 *
 * Uses LLM to consolidate multiple documentation proposals into a single cohesive file.
 * This replaces mechanical find-replace operations with intelligent integration of changes.
 *
 * @author Wayne
 * @created 2025-11-11
 */

import { DocProposal } from '@prisma/client';
import { llmService } from '../llm/llm-service.js';
import { PROMPT_TEMPLATES, fillTemplate } from '../llm/prompt-templates.js';
import { getConfig } from '../../config/loader.js';
import { z } from 'zod';

// Consolidation model - configurable via env var, defaults to gemini-2.5-flash
const CONSOLIDATION_MODEL = process.env.LLM_CONSOLIDATION_MODEL || 'gemini-2.5-flash';

// Schema for the LLM response (just the raw file content)
const FileConsolidationResponseSchema = z.object({
  consolidatedContent: z.string().describe('The complete, consolidated file content'),
});

interface ConsolidationResult {
  consolidatedContent: string;
  tokensUsed?: number;
}

export class FileConsolidationService {
  /**
   * Consolidate multiple proposals for a single file using LLM
   *
   * @param filePath - The file being modified
   * @param originalContent - The original file content
   * @param proposals - Array of proposals to apply to this file
   * @returns The consolidated file content
   */
  async consolidateFile(
    filePath: string,
    originalContent: string,
    proposals: DocProposal[]
  ): Promise<ConsolidationResult> {

    if (proposals.length === 0) {
      return { consolidatedContent: originalContent };
    }

    // Format proposed changes for the prompt
    const proposedChanges = proposals
      .map((proposal, index) => {
        const text = proposal.editedText || proposal.suggestedText || '';
        const updateType = proposal.updateType || 'UPDATE';
        const section = proposal.section || 'Unspecified section';
        const reasoning = proposal.reasoning || 'No reasoning provided';

        return `
## Change ${index + 1}: ${updateType} - ${section}

**Type**: ${updateType}
**Section**: ${section}
**Reasoning**: ${reasoning}

**Proposed Content**:
${text}
`.trim();
      })
      .join('\n\n---\n\n');

    // Get project configuration
    const config = getConfig();

    // Build the prompt using template
    const systemPrompt = fillTemplate(PROMPT_TEMPLATES.fileConsolidation.system, {
      projectName: config.project.name,
    });

    const userPrompt = fillTemplate(PROMPT_TEMPLATES.fileConsolidation.user, {
      projectName: config.project.name,
      filePath,
      originalContent,
      changeCount: proposals.length,
      proposedChanges,
    });

    console.log('\n' + '='.repeat(80));
    console.log(`🔧 CONSOLIDATING FILE: ${filePath}`);
    console.log('='.repeat(80));
    console.log(`Original file length: ${originalContent.length} characters`);
    console.log(`Number of proposals: ${proposals.length}`);
    console.log(`Update types: ${proposals.map(p => p.updateType).join(', ')}`);
    console.log('='.repeat(80) + '\n');

    try {
      // Call LLM to consolidate changes
      const { data, response } = await llmService.requestJSON(
        {
          model: CONSOLIDATION_MODEL,
          systemPrompt,
          userPrompt,
          temperature: 0.3, // Lower temperature for consistent output
          maxTokens: 8000, // Allow longer output for complete files
        },
        FileConsolidationResponseSchema
      );

      console.log('\n' + '='.repeat(80));
      console.log('✅ FILE CONSOLIDATION COMPLETE');
      console.log('='.repeat(80));
      console.log(`Consolidated file length: ${data.consolidatedContent.length} characters`);
      console.log(`Tokens used: ${response.tokensUsed || 'unknown'}`);
      console.log('='.repeat(80) + '\n');

      return {
        consolidatedContent: data.consolidatedContent,
        tokensUsed: response.tokensUsed,
      };
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('❌ FILE CONSOLIDATION FAILED');
      console.error('='.repeat(80));
      console.error(`File: ${filePath}`);
      console.error(`Error: ${(error as Error).message}`);
      console.error('='.repeat(80) + '\n');

      throw new Error(`Failed to consolidate file ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Check if file should use LLM consolidation
   *
   * Criteria:
   * - Multiple proposals for same file
   * - File size is reasonable (not too large)
   * - At least one UPDATE or complex change
   *
   * @param proposals - Proposals for a file
   * @param fileContent - Original file content
   * @returns Whether to use LLM consolidation
   */
  shouldConsolidate(proposals: DocProposal[], fileContent: string): boolean {
    // Don't consolidate if only one proposal
    if (proposals.length <= 1) {
      return false;
    }

    // Don't consolidate if file is too large (>50KB)
    const MAX_FILE_SIZE = 50_000;
    if (fileContent.length > MAX_FILE_SIZE) {
      console.log(`⚠️  Skipping consolidation - file too large (${fileContent.length} chars)`);
      return false;
    }

    // Always consolidate if there are UPDATE operations (to avoid replacement issue)
    const hasUpdate = proposals.some(p => p.updateType === 'UPDATE');
    if (hasUpdate) {
      return true;
    }

    // Consolidate if multiple proposals (for better coherence)
    return true;
  }
}

// Export singleton instance
export const fileConsolidationService = new FileConsolidationService();
