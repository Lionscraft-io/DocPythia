/**
 * LLM Service Mock
 * Provides mock implementations for LLM service operations
 */

import { vi } from 'vitest';

export const mockLLMService = {
  requestJSON: vi.fn(),
};

export const mockBatchClassificationResponse = {
  valuableMessages: [
    {
      messageId: 1,
      category: 'troubleshooting',
      docValueReason: 'User encountered an error not documented',
      suggestedDocPage: 'docs/troubleshooting.md',
      ragSearchCriteria: {
        keywords: ['error', 'rpc', 'connection'],
        semanticQuery: 'RPC connection troubleshooting',
      },
    },
    {
      messageId: 2,
      category: 'update',
      docValueReason: 'New feature announcement',
      suggestedDocPage: 'docs/updates.md',
      ragSearchCriteria: {
        keywords: ['feature', 'release'],
        semanticQuery: 'new features and releases',
      },
    },
  ],
  batchSummary: 'Found 2 valuable messages: 1 troubleshooting, 1 update',
};

export const mockProposalResponse = {
  updateType: 'UPDATE',
  page: 'docs/troubleshooting.md',
  section: 'Common Errors',
  location: {
    lineStart: 45,
    lineEnd: 50,
    sectionName: 'RPC Timeout Errors',
  },
  suggestedText: 'Updated section about RPC timeout errors...',
  reasoning: 'This error pattern is common but not documented',
  confidence: 0.85,
};

export const createMockLLMResponse = (data: any) => ({
  data,
  response: {
    content: JSON.stringify(data),
    modelUsed: 'gemini-2.5-flash',
    tokensUsed: 500,
    finishReason: 'STOP',
  },
});

// Helper to reset LLM service mocks
export const resetLLMServiceMocks = () => {
  mockLLMService.requestJSON.mockReset();
};

// Setup default mock behavior
export const setupLLMServiceMocks = () => {
  mockLLMService.requestJSON.mockImplementation(async (request, schema, purpose, messageId) => {
    if (purpose === 'analysis') {
      // Batch classification
      return createMockLLMResponse(mockBatchClassificationResponse);
    } else if (purpose === 'changegeneration') {
      // Proposal generation
      return createMockLLMResponse(mockProposalResponse);
    }
    return createMockLLMResponse({});
  });
};
