# LLM Cache Search Enhancement

**Author:** Wayne
**Date:** 2025-10-31
**Purpose:** Enable searching LLM cache and retrieving all related requests for matching messages

## Overview

Enhanced the LLM cache system to link cache entries to messages and provide comprehensive search functionality. When searching the cache, you can now retrieve all related LLM requests for the same message across different purposes (analysis, change generation, review).

## Changes Made

### 1. Cache Purpose Enhancement

Added new `review` cache purpose to separate review requests from classification:

```typescript
export type CachePurpose = 'index' | 'embeddings' | 'analysis' | 'changegeneration' | 'review' | 'general';
```

**File:** `server/llm/llm-cache.ts:17`

### 2. Cache Metadata Enhancement

Added `messageId` field to `CachedLLMRequest` interface to link cache entries to `UnifiedMessage` records:

```typescript
export interface CachedLLMRequest {
  hash: string;
  purpose: CachePurpose;
  prompt: string;
  response: string;
  timestamp: string;
  model?: string;
  tokensUsed?: number;
  messageId?: number; // NEW: Link to UnifiedMessage
}
```

**File:** `server/llm/llm-cache.ts:19-28`

### 3. New Search Methods

#### `search(searchText: string, purpose?: CachePurpose): CachedLLMRequest[]`

Basic text search across cache entries:

```typescript
// Search all cache entries for "troubleshooting"
const results = llmCache.search('troubleshooting');

// Search only analysis cache
const analysisResults = llmCache.search('troubleshooting', 'analysis');
```

**File:** `server/llm/llm-cache.ts:343-384`

#### `findByMessageId(messageId: number): { purpose: CachePurpose; request: CachedLLMRequest }[]`

Find all cache entries for a specific message:

```typescript
// Get all LLM requests for message ID 123
const messageRequests = llmCache.findByMessageId(123);
// Returns: [
//   { purpose: 'analysis', request: {...} },
//   { purpose: 'changegeneration', request: {...} },
//   { purpose: 'analysis', request: {...} } // review
// ]
```

**File:** `server/llm/llm-cache.ts:390-424`

#### `searchWithRelated(searchText: string, purpose?: CachePurpose): MessageGroup[]`

**PRIMARY METHOD** - Search and automatically include all related requests:

```typescript
// Search for "troubleshooting" and get all related requests for matching messages
const results = llmCache.searchWithRelated('troubleshooting');

// Results grouped by message:
// [
//   {
//     messageId: 123,
//     entries: [
//       { purpose: 'analysis', request: {...} },      // Classification
//       { purpose: 'changegeneration', request: {...} }, // Proposal
//       { purpose: 'analysis', request: {...} }       // Review
//     ]
//   },
//   {
//     messageId: 456,
//     entries: [...]
//   }
// ]
```

**File:** `server/llm/llm-cache.ts:431-492`

### 4. Service Layer Updates

Updated `llmService.requestJSON()` to accept and store messageId:

```typescript
async requestJSON<T = any>(
  request: LLMRequest,
  responseSchema: any,
  cachePurpose?: CachePurpose,
  messageId?: number  // NEW parameter
): Promise<{ data: T; response: LLMResponse }>
```

**Files:**
- `server/stream/llm/llm-service.ts:83-88`
- `server/stream/llm/llm-service.ts:222-227`

### 5. Message Processor Integration

Updated all three LLM request points to pass messageId and use appropriate cache purposes:

1. **Classification (analysis):**
   ```typescript
   await llmService.requestJSON(
     { model, systemPrompt, userPrompt },
     schema,
     'analysis',
     messageId  // NEW
   );
   ```
   **File:** `server/stream/processors/message-processor.ts:287-296`

2. **Proposal Generation (changegeneration):**
   ```typescript
   await llmService.requestJSON(
     { model, systemPrompt, userPrompt, history },
     schema,
     'changegeneration',
     messageId  // NEW
   );
   ```
   **File:** `server/stream/processors/message-processor.ts:418-428`

3. **Review (review):** ← **NEW CATEGORY**
   ```typescript
   await llmService.requestJSON(
     { model, systemPrompt, userPrompt, history },
     schema,
     'review',  // NEW: Separate category for reviews
     messageId  // NEW
   );
   ```
   **File:** `server/stream/processors/message-processor.ts:480-490`

## How It Works

When you search for "troubleshooting", the system will:
1. Find all cache entries containing "troubleshooting"
2. Extract the messageId from matching entries
3. Find ALL other cache entries for those same messageIds across all purposes
4. Return grouped results showing the complete LLM processing pipeline for each message

## Cache Categories by Stage

Each message processing stage now has its own cache category:

- **analysis** - LLM-1 Classification (doc value, category, RAG criteria)
- **changegeneration** - LLM-2 Proposal Generation (update type, page, changes)
- **review** - LLM-3 Final Review (approve/reject with reasoning)
- **embeddings** - Text embeddings for RAG search
- **index** - Documentation indexing
- **general** - Other LLM requests

This separation allows you to:
- Search specifically within one stage (e.g., only review requests)
- Track the complete pipeline for each message
- Distinguish between classification and review analysis

## Usage Examples

### Example 1: Search for Troubleshooting Messages

```typescript
import { llmCache } from './server/llm/llm-cache.js';

// Find all messages about troubleshooting with complete LLM history
const results = llmCache.searchWithRelated('troubleshooting');

for (const group of results) {
  console.log(`\nMessage ID: ${group.messageId}`);
  console.log(`Total LLM requests: ${group.entries.length}`);

  for (const entry of group.entries) {
    console.log(`  - ${entry.purpose}: ${entry.request.model}`);
    console.log(`    Prompt preview: ${entry.request.prompt.substring(0, 100)}...`);
  }
}

// Example Output:
// Message ID: 141
// Total LLM requests: 3
//   - analysis: gemini-2.0-flash-exp
//     Prompt preview: Analyze the following message for documentation value...
//   - changegeneration: gemini-1.5-pro
//     Prompt preview: Generate an update proposal for the following message...
//   - review: gemini-exp-1206
//     Prompt preview: Review the following documentation update proposal...
```

### Example 2: Analyze Complete Message Processing

```typescript
// Get all LLM interactions for a specific message
const messageId = 141;
const requests = llmCache.findByMessageId(messageId);

console.log(`Message ${messageId} processing pipeline:`);
for (const { purpose, request } of requests) {
  console.log(`\n${purpose.toUpperCase()}`);
  console.log(`  Model: ${request.model}`);
  console.log(`  Tokens: ${request.tokensUsed}`);
  console.log(`  Timestamp: ${request.timestamp}`);
  console.log(`  Response preview: ${request.response.substring(0, 200)}...`);
}

// Example Output:
// Message 141 processing pipeline:
//
// ANALYSIS
//   Model: gemini-2.0-flash-exp
//   Tokens: 450
//   Timestamp: 2025-10-31T12:34:56.789Z
//   Response preview: {"category":"troubleshooting","docValue":true,...}
//
// CHANGEGENERATION
//   Model: gemini-1.5-pro
//   Tokens: 1250
//   Timestamp: 2025-10-31T12:35:02.123Z
//   Response preview: {"updateType":"UPDATE","page":"docs/troubleshooting",...}
//
// REVIEW
//   Model: gemini-exp-1206
//   Tokens: 890
//   Timestamp: 2025-10-31T12:35:08.456Z
//   Response preview: {"action":"APPROVE","approved":true,...}
```

### Example 3: Debug Failed Classifications

```typescript
// Find all classification requests and see related generation/review
const classificationResults = llmCache.search('docValue', 'analysis');

// For each classification, get the full processing history
for (const result of classificationResults) {
  if (result.messageId) {
    const allRequests = llmCache.findByMessageId(result.messageId);
    console.log(`\nMessage ${result.messageId} had ${allRequests.length} LLM calls`);

    // Check if proposal was generated
    const hasProposal = allRequests.some(r => r.purpose === 'changegeneration');
    console.log(`  Proposal generated: ${hasProposal}`);
  }
}
```

## Benefits

1. **Complete Context:** When you find an interesting cached analysis, you automatically get the proposal and review for that message
2. **Debugging:** Trace the complete LLM processing pipeline for any message
3. **Analytics:** Analyze how messages flow through the classification → proposal → review pipeline
4. **Cost Tracking:** Sum token usage across all LLM calls for a message
5. **Quality Assurance:** Compare classification, proposal, and review outputs side-by-side

## Backward Compatibility

- Existing cache entries without `messageId` will have `messageId: null`
- Old cache entries are still searchable and usable
- New code gracefully handles missing `messageId` fields

## Testing

After implementation, test with:

```typescript
// 1. Process some messages
// 2. Search the cache
const results = llmCache.searchWithRelated('error');

// 3. Verify results include all related requests
for (const group of results) {
  console.assert(group.entries.length >= 1, 'Should have at least one entry');
  console.assert(
    group.entries.every(e => e.request.messageId === group.messageId),
    'All entries should belong to the same message'
  );
}
```

## Future Enhancements

Possible additions:
- Admin UI endpoint to expose `searchWithRelated()`
- Statistics endpoint showing average LLM calls per message
- Filter by date range, model, or token usage
- Export complete processing history for specific messages
