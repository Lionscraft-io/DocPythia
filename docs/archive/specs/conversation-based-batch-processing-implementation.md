# Conversation-Based Batch Processing Implementation

**Developer:** Wayne
**Date:** 2025-11-03
**Status:** Implemented

## Overview

Upgraded Phase 1 batch message processing to group valuable messages into logical conversations, reducing LLM API calls and improving context quality for documentation proposals.

## Architecture Change

### Before (Per-Message Processing)
```
24-hour batch → Classify (1 call) → n valuable messages
  → n RAG calls (1 per message)
  → n Proposal calls (1 per message)
  → Total: 1 + n + n = 2n + 1 LLM calls
```

### After (Conversation-Based Processing)
```
24-hour batch → Classify (1 call) → n valuable messages
  → Group into m conversations (m ≤ n)
  → m RAG calls (1 per conversation)
  → m Proposal calls (1 per conversation)
  → Total: 1 + m + m = 2m + 1 LLM calls (where m ≤ n)
```

**Efficiency Gain:**
- If 10 messages group into 4 conversations: 21 calls → 9 calls (57% reduction)
- If 20 messages group into 6 conversations: 41 calls → 13 calls (68% reduction)

## Conversation Grouping Algorithm

### Logic
1. **Group by channel first** - Messages in same channel are more likely related
2. **Group by temporal proximity** - Messages within TIME_WINDOW minutes
3. **Limit conversation size** - Max 20 messages per conversation
4. **Detect conversation boundaries** - Minimum 5-minute gap

### Configuration
```typescript
{
  conversationTimeWindowMinutes: 15,  // Messages within 15min = same conversation
  maxConversationSize: 20,            // Split if conversation exceeds 20 messages
  minConversationGapMinutes: 5,      // 5min silence = new conversation starts
}
```

### Example Grouping

**Input:** 10 valuable messages from classification
```
#general: [10:00, 10:05, 10:12] (3 messages)
#general: [15:00, 15:08] (2 messages)
#help: [12:00, 12:10, 12:15, 12:18] (4 messages)
#dev: [14:30] (1 message)
```

**Output:** 4 conversation groups
```
Conversation 1: #general, 3 messages (10:00-10:12)
Conversation 2: #general, 2 messages (15:00-15:08)
Conversation 3: #help, 4 messages (12:00-12:18)
Conversation 4: #dev, 1 message (14:30)
```

**Processing:**
- 4 RAG calls (1 per conversation)
- 4 Proposal generation calls (1 per conversation)
- Each RAG call searches docs relevant to entire conversation
- Each Proposal call generates proposals for all messages in conversation

## Implementation Details

### File: `server/stream/processors/batch-message-processor.ts`

**New Types:**
```typescript
interface ConversationGroup {
  id: string;
  channel: string | null;
  messages: Array<{
    messageId: number;
    timestamp: Date;
    author: string;
    content: string;
    category: string;
    docValueReason: string;
    suggestedDocPage?: string;
    ragSearchCriteria?: any;
  }>;
  timeStart: Date;
  timeEnd: Date;
  messageCount: number;
}
```

**New Methods:**
1. `groupIntoConversations()` - Groups valuable messages into conversations
2. `isSignificantGap()` - Detects conversation boundaries (5min+ gap)
3. `processConversation()` - RAG + Proposals for entire conversation
4. `performConversationRAG()` - Combines search criteria from all messages
5. `generateConversationProposals()` - Returns array of proposals for conversation

### Modified Flow

**processBatch():**
```typescript
// Step 5: Batch classification (unchanged)
const classification = await this.classifyBatch(messages, contextMessages, batchId);

// Step 6: Store classification results (unchanged)
await this.storeClassificationResults(classification, batchId);

// Step 7: Group valuable messages into conversations (NEW)
const conversations = await this.groupIntoConversations(
  classification.valuableMessages,
  messages,
  contextMessages
);

// Step 8: Process each conversation (NEW)
for (const conversation of conversations) {
  const proposalCount = await this.processConversation(conversation);
}
```

**processConversation():**
```typescript
async processConversation(conversation: ConversationGroup): Promise<number> {
  // 1. RAG retrieval once for entire conversation
  const ragDocs = await this.performConversationRAG(conversation);

  // 2. Store RAG context for each message
  for (const msg of conversation.messages) {
    await prisma.messageRagContext.create({ ... });
  }

  // 3. Generate proposals for all messages together
  const proposals = await this.generateConversationProposals(conversation, ragDocs);

  // 4. Store proposals
  for (const proposal of proposals) {
    await prisma.docProposal.create({ ... });
  }

  return proposalCount;
}
```

## RAG Enhancement

### Conversation-Wide RAG Search

Instead of searching for each message individually, we now:
1. Combine content from all messages in conversation
2. Merge all RAG search criteria (keywords + semantic queries)
3. Perform ONE search that finds docs relevant to entire conversation
4. Share these docs across all proposal generations

**Benefits:**
- More comprehensive documentation retrieval
- Better context for related messages
- Reduced API calls to embedding service

### Example

**Conversation:** 3 messages about RPC connection issues
```
Message 1: "Getting timeout errors on RPC calls"
Message 2: "Is there a retry mechanism?"
Message 3: "What's the recommended timeout setting?"
```

**Combined RAG Search:**
- Keywords: ["rpc", "timeout", "retry", "connection", "error", "settings"]
- Semantic: "RPC connection timeout errors retry mechanism timeout settings"
- Result: Retrieves comprehensive docs covering all aspects of RPC configuration

## Proposal Generation Enhancement

### Conversation-Aware Proposals

LLM now receives:
1. **Full conversation context** - All related messages together
2. **Shared documentation** - Same RAG docs for entire conversation
3. **Task** - Generate proposals for each message considering full context

**Prompt Structure:**
```
CONVERSATION (3 messages in #help):
[MESSAGE 1] (ID: 123)
Author: user1
Content: "Getting timeout errors on RPC calls"
...

[MESSAGE 2] (ID: 124)
Author: user2
Content: "Is there a retry mechanism?"
...

RELEVANT DOCUMENTATION:
[DOC 1] RPC Configuration Guide
[DOC 2] Error Handling Best Practices
[DOC 3] Timeout Settings

Generate proposals for each message that needs documentation updates.
```

**Response:**
```json
{
  "proposals": [
    {
      "messageId": 123,
      "updateType": "UPDATE",
      "page": "docs/api/rpc-config.md",
      "section": "Timeout Errors",
      ...
    },
    {
      "messageId": 124,
      "updateType": "INSERT",
      "page": "docs/api/rpc-config.md",
      "section": "Retry Mechanism",
      ...
    }
  ]
}
```

## Code Cleanup

### Removed Files
- `server/stream/processors/message-processor.ts` (594 lines) - Old per-message processor
- `server/rag/context-manager.ts` (233 lines) - Replaced by direct vectorStore usage

### Updated Files
- `server/routes.ts` - Widget endpoint uses vectorStore directly (removed ragContextManager)
- `server/stream/stream-manager.ts` - Only imports messages, batch processor handles processing
- `server/stream/processors/batch-message-processor.ts` - Conversation-based processing

## Testing

### Manual Test Flow

1. **Import messages:**
   ```bash
   POST /api/admin/stream/import-csv
   ```

2. **Run batch processing:**
   ```bash
   POST /api/admin/stream/process-batch
   ```

3. **Check results:**
   ```bash
   GET /api/admin/stream/messages?docValue=true
   ```

4. **Verify conversations:**
   - Check that related messages share same RAG docs (messageRagContext table)
   - Verify proposals reference same documentation pages
   - Confirm reduced LLM call count in logs

### Expected Log Output

```
[BatchProcessor] Starting batch processing...
[BatchProcessor] Fetched 50 messages for batch
[BatchProcessor] Identified 12 valuable messages
[BatchProcessor] Grouped into 4 conversations

[BatchProcessor] Processing conversation conv_general_1699012345 (3 messages)
[BatchProcessor] RAG search for conversation: "timeout errors rpc connection..."
[BatchProcessor] Generating proposals for conversation conv_general_1699012345
[BatchProcessor] Conversation conv_general_1699012345 complete. Generated 2 proposals

[BatchProcessor] Processing conversation conv_help_1699015678 (2 messages)
...

[BatchProcessor] Batch complete. Processed 4 conversations, 8 proposals
```

## Performance Impact

### API Call Reduction
- **Before:** 2n + 1 calls (n = valuable messages)
- **After:** 2m + 1 calls (m = conversations, m ≤ n)
- **Typical reduction:** 50-70% fewer LLM API calls

### Quality Improvement
- Better context awareness (LLM sees related messages together)
- More comprehensive documentation retrieval
- Consistent proposals across related messages
- Reduced chance of duplicate/conflicting proposals

## Configuration

Environment variables (optional, defaults shown):
```bash
# Conversation grouping
CONVERSATION_TIME_WINDOW_MINUTES=15
MAX_CONVERSATION_SIZE=20
MIN_CONVERSATION_GAP_MINUTES=5

# RAG configuration
RAG_TOP_K=5

# Models
LLM_CLASSIFICATION_MODEL=gemini-2.0-flash-exp
LLM_PROPOSAL_MODEL=gemini-1.5-pro
```

## Next Steps

1. Monitor conversation grouping quality in production
2. Fine-tune time windows based on actual conversation patterns
3. Consider adding topic-based grouping (using embeddings)
4. Implement conversation metadata tracking (conversation_id in database)

## References

- Spec: `/docs/specs/multi-stream-scanner-phase-1.md` (lines 211-252)
- Implementation: `/server/stream/processors/batch-message-processor.ts`
- Related: `/docs/temp/phase1-implementation-status.md`
