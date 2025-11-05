/**
 * LLM Prompt Builders
 * Structured prompt generation for message classification, proposal, and review
 * Author: Wayne
 * Date: 2025-10-30
 * Reference: /docs/specs/multi-stream-scanner-phase-1.md
 */

import { ProjectContext } from '../types.js';
import { docIndexGenerator } from '../doc-index-generator.js';
import e from 'express';

export class PromptBuilders {
  /**
   * LLM-1: Classification Prompt
   * Determines if message has documentation value
   */
  static async buildClassificationPrompt(
    messageContent: string,
    messageAuthor: string,
    messageTimestamp: Date,
    messageChannel?: string
  ): Promise<{ system: string; user: string }> {
    const projectContext = await docIndexGenerator.generateIndex();
    const docIndexFormatted = docIndexGenerator.formatCompact(projectContext);

    const system = `You are an expert technical analyst evaluating messages for documentation value.

Your task: Analyze messages from community channels to determine if they contain information that should update documentation.

Guidelines:
- Look for: bug reports, feature discussions, configuration tips, troubleshooting solutions, best practices, breaking changes
- Ignore: spam, off-topic chat, personal messages, administrative discussions
- Consider: Is this information that future developers would find valuable?

Available Documentation:
${docIndexFormatted}

Always respond with valid JSON matching the provided schema.`;

    const user = `Analyze this message for documentation value:

Message Details:
- Author: ${messageAuthor}
- Timestamp: ${messageTimestamp.toISOString()}
${messageChannel ? `- Channel: ${messageChannel}` : ''}

Message Content:
${messageContent}

Determine:
1. Category (e.g., "bug_report", "feature_request", "troubleshooting", "configuration", "best_practice", "off_topic")
2. Information type ("question", "answer", "statement")
3. Does this have documentation value? (true/false)
4. Provide reasoning for your decision
5. If has documentation value, suggest RAG search criteria for context up to 2 (keywords, concepts, related pages in index)

Consider the full context.`;

    return { system, user };
  }

  /**
   * Schema for classification response
   */
  static getClassificationSchema() {
    return {
      type: 'object' as const,
      properties: {
        category: { type: 'string', enum: ['bug_report', 'feature_request', 'troubleshooting', 'configuration', 'best_practice', 'off_topic'] },
        informationType: { type: 'string', enum: ['question', 'answer', 'statement'] },
        docValue: { type: 'boolean' },
        docValueReason: { type: 'string', nullable: true },
        ragSearchCriteria: {
          type: 'object',
          nullable: true,
          properties: {
            keywords: { type: 'array', items: { type: 'string' } },
            concepts: { type: 'array', items: { type: 'string' } },
            relatedPages: { type: 'array', items: { type: 'string' } },
          },
        }
      },
      required: ['category', 'informationType', 'docValue'],
    };
  }

  /**
   * LLM-2: Update Proposal Prompt
   * Generates specific documentation update recommendations
   * Note: Related messages should be pre-formatted into ragContext using formatRAGContext()
   */
  static async buildProposalPrompt(
    messageContent: string,
    messageAuthor: string,
    classification: any,
    ragContext: string,
    classificationPrompts?: { system: string; user: string; assistant: string }
  ): Promise<{ system: string; user: string; history?: Array<{ role: string; content: string }> }> {
    const system = `You are an expert technical writer creating documentation update proposals.

Your task: Given a message with documentation value and relevant context, propose specific documentation updates.

Guidelines:
- Be specific: Provide exact page paths, section names, character ranges
- Be conservative: Only propose changes you're confident about
- Consider impact: Is this INSERT (new), UPDATE (modify existing), DELETE (remove outdated), or NONE (no action)?
- Maintain style: Match the existing documentation tone and format

Always respond with valid JSON matching the provided schema.`;

    const user = `Create a documentation update proposal for this message:

Message Content:
${messageContent}

Author: ${messageAuthor}
Category: ${classification.category}
Information Type: ${classification.informationType}
Classification Reasoning: ${classification.docValueReason || 'N/A'}

${ragContext}

Propose:
1. Which page(s) should be updated (full path)
2. Type of update: INSERT | UPDATE | DELETE | NONE
3. Specific section name (if applicable)
4. Character range for the change [start, end]
5. Suggested text (for INSERT/UPDATE) or explanation (for DELETE)
6. Detailed reasoning for this proposal

If no update is needed, specify updateType: "NONE" with reasoning.`;

    // Build conversation history if classification prompts are provided
    const history: Array<{ role: string; content: string }> = [];
    if (classificationPrompts) {
      history.push({
        role: 'user',
        content: `${classificationPrompts.system}\n\n${classificationPrompts.user}`
      });
      history.push({
        role: 'assistant',
        content: classificationPrompts.assistant
      });
    }

    return { system, user, history: history.length > 0 ? history : undefined };
  }

  /**
   * Schema for proposal response
   */
  static getProposalSchema() {
    return {
      type: 'object' as const,
      properties: {
        page: { type: 'string' },
        updateType: { type: 'string', enum: ['INSERT', 'UPDATE', 'DELETE', 'NONE'] },
        section: { type: 'string', nullable: true },
        characterRange: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        suggestedText: { type: 'string', nullable: true },
        reasoning: { type: 'string', nullable: true },
      },
      required: ['page', 'updateType', 'characterRange'],
    };
  }

  /**
   * LLM-3: Review Prompt
   * Final validation of proposed changes
   */
  static async buildReviewPrompt(
    messageContent: string,
    proposal: any,
    ragContext: string,
    classificationPrompts?: { system: string; user: string; assistant: string },
    proposalPrompts?: { system: string; user: string; assistant: string }
  ): Promise<{ system: string; user: string; history?: Array<{ role: string; content: string }> }> {
    const system = `You are a senior technical editor reviewing documentation update proposals.

Your task: Critically evaluate proposed documentation changes for accuracy, relevance, and quality.

Guidelines:
- Verify: Does the proposal accurately reflect the message intent?
- Validate: Is the proposed change technically correct?
- Assess quality: Does it match documentation standards?
- Consider impact: Will this improve or harm the documentation?
- Be critical: Only approve high-quality, accurate changes

Actions:
- approve: Change is good as-is
- modify: Change needs adjustment (provide improved version)
- reject: Change should not be applied (explain why)

Always respond with valid JSON matching the provided schema.`;

    const user = `Review this documentation update proposal:

Original Message:
${messageContent}

Proposed Change:
- Page: ${proposal.page}
- Type: ${proposal.updateType}
- Section: ${proposal.section || 'N/A'}
- Character Range: ${JSON.stringify(proposal.characterRange)}
- Suggested Text: ${proposal.suggestedText || 'N/A'}
- Reasoning: ${proposal.reasoning || 'N/A'}

Retrieved Context:
${ragContext}

Provide:
1. Decision: approve | modify | reject
2. Approved status (boolean)
3. Detailed reasons for your decision
4. If "modify": provide improved change text
5. Consider: accuracy, relevance, technical correctness, documentation quality`;

    // Build conversation history if prompts are provided
    const history: Array<{ role: string; content: string }> = [];
    if (classificationPrompts) {
      history.push({
        role: 'user',
        content: `${classificationPrompts.system}\n\n${classificationPrompts.user}`
      });
      history.push({
        role: 'assistant',
        content: classificationPrompts.assistant
      });
    }
    if (proposalPrompts) {
      history.push({
        role: 'user',
        content: `${proposalPrompts.system}\n\n${proposalPrompts.user}`
      });
      history.push({
        role: 'assistant',
        content: proposalPrompts.assistant
      });
    }

    return { system, user, history: history.length > 0 ? history : undefined };
  }

  /**
   * Schema for review response
   */
  static getReviewSchema() {
    return {
      type: 'object' as const,
      properties: {
        approved: { type: 'boolean' },
        action: { type: 'string', enum: ['approve', 'modify', 'reject'] },
        reasons: { type: 'string', nullable: true },
        proposedChange: { type: 'string', nullable: true },
      },
      required: ['approved', 'action'],
    };
  }

  /**
   * Build RAG search query from classification
   */
  static buildRAGSearchQuery(classification: any): string {
    const keywords = classification.ragSearchCriteria?.keywords || [];
    const concepts = classification.ragSearchCriteria?.concepts || [];

    const parts: string[] = [];

    if (keywords.length > 0) {
      parts.push(keywords.join(' '));
    }

    if (concepts.length > 0) {
      parts.push(concepts.join(' '));
    }

    // Fallback to category if no specific criteria
    if (parts.length === 0) {
      parts.push(classification.category);
    }

    return parts.join(' ');
  }

  /**
   * Format RAG context for LLM prompts (supports both documentation and messages)
   */
  static formatRAGContext(
    docs: Array<{ title: string; content: string; similarity: number }>,
    messages?: Array<{ content: string; author: string; timestamp: Date; similarity: number }>,
    totalMessagesCount?: number
  ): string {
    if (docs.length === 0 && (!messages || messages.length === 0)) {
      return 'No relevant documentation or messages found.';
    }

    let formatted = '=== Retrieved Context ===\n\n';

    // Add documentation context
    if (docs.length > 0) {
      formatted += '--- Documentation ---\n\n';
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        formatted += `[Doc ${i + 1}] ${doc.title} (${(doc.similarity * 100).toFixed(1)}% relevant)\n`;
        formatted += `${doc.content.substring(0, 1000)}${doc.content.length > 1000 ? '...' : ''}\n\n`;
      }
    }

    // Add related messages context
    if (messages && messages.length > 0) {
      formatted += `--- Related Messages (${totalMessagesCount || messages.length} similar found, showing top ${messages.length}) ---\n\n`;
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        formatted += `[Message ${i + 1}] by ${msg.author} at ${msg.timestamp.toISOString()} (${(msg.similarity * 100).toFixed(1)}% similar)\n`;
        formatted += `${msg.content.substring(0, 300)}${msg.content.length > 300 ? '...' : ''}\n\n`;
      }
    }

    return formatted;
  }
}
