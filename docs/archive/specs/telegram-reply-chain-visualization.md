# Spec: Telegram Reply Chain Visualization for Enhanced LLM Context

**Author:** Wayne
**Date:** 2025-11-04
**Status:** Approved
**Related Story:** `/docs/stories/telegram-reply-chain-and-url-extraction.md`

## Overview

Enhance the batch message processor's `formatMessage()` function to visualize Telegram reply chains using indentation and arrows (like threaded forum posts). This improves the LLM's ability to understand conversation structure for better documentation relevance assessment.

**Key Principle:** Only show reply indentation if the original message IS in the current batch. If not, display flat (no error, no indicator).

## Implementation Details

### 1. Build Reply Chain Map

**File:** `/root/src/lionscraft-NearDocsAI/server/stream/processors/batch-message-processor.ts`

**New Method:**
```typescript
/**
 * Build a map of message reply relationships within the current batch
 * Returns: Map<messageId, { replyToId, depth }>
 */
private buildReplyChainMap(messages: any[]): Map<string, { replyToId: string | null, depth: number }> {
  const chainMap = new Map<string, { replyToId: string | null, depth: number }>();

  // Create lookup by composite messageId ("{chatId}-{messageId}")
  const messageIdSet = new Set(messages.map(m => m.messageId));

  // First pass: identify direct reply relationships within batch
  for (const msg of messages) {
    const replyToMessageId = msg.metadata?.replyToMessageId;
    const chatId = msg.metadata?.chatId;

    if (replyToMessageId && chatId) {
      const replyToCompositeId = `${chatId}-${replyToMessageId}`;

      // Only track reply if original message IS in batch
      if (messageIdSet.has(replyToCompositeId)) {
        chainMap.set(msg.messageId, {
          replyToId: replyToCompositeId,
          depth: 0 // Will be calculated in second pass
        });
      }
    }

    // Non-reply messages or replies to messages outside batch
    if (!chainMap.has(msg.messageId)) {
      chainMap.set(msg.messageId, {
        replyToId: null,
        depth: 0
      });
    }
  }

  // Second pass: calculate depth (indentation level)
  const calculateDepth = (messageId: string, visited: Set<string>): number => {
    if (visited.has(messageId)) return 0; // Circular reference protection

    const chain = chainMap.get(messageId);
    if (!chain || !chain.replyToId) return 0;

    visited.add(messageId);
    return 1 + calculateDepth(chain.replyToId, visited);
  };

  for (const [messageId, chain] of chainMap.entries()) {
    chain.depth = calculateDepth(messageId, new Set());
  }

  return chainMap;
}
```

### 2. Enhanced formatMessage with Indentation

**Modified classifyBatch method:**
```typescript
private async classifyBatch(
  messages: any[],
  contextMessages: any[],
  batchId: string
): Promise<BatchClassificationResult> {

  // Build reply chain map for this batch
  const replyChainMap = this.buildReplyChainMap(messages);

  // Format messages for prompt
  const formatMessage = (msg: any) => {
    const chain = replyChainMap.get(msg.messageId);
    const depth = chain?.depth || 0;
    const indent = '  '.repeat(depth); // 2 spaces per level

    let formatted = '';

    // Add reply indicator if this is a reply (depth > 0)
    if (depth > 0) {
      formatted += `${indent}↳ Reply to message above\n`;
    }

    // Add the message itself with indentation
    formatted += `${indent}[${msg.timestamp.toISOString()}] ${msg.author} in ${msg.channel || 'general'}: ${msg.content}`;

    return formatted;
  };

  // Rest of classifyBatch logic unchanged...
  const contextText = contextMessages.map(formatMessage).join('\n\n');
  const messagesToAnalyze = messages.map((msg, idx) => {
    return `[MSG_${msg.id}] ${formatMessage(msg)}`;
  }).join('\n\n');

  // Continue with existing LLM prompt construction...
}
```

### 3. Example Output

**Input Messages:**
```javascript
[
  { id: 1, messageId: "123-100", content: "How do I deploy?", metadata: {} },
  { id: 2, messageId: "123-101", content: "Check the docs", metadata: { replyToMessageId: "100", chatId: "123" } },
  { id: 3, messageId: "123-102", content: "Thanks!", metadata: { replyToMessageId: "101", chatId: "123" } }
]
```

**Formatted Output for LLM:**
```
[MSG_1] [2025-11-04T10:00:00Z] Alice in NEAR Developers: How do I deploy?

[MSG_2]   ↳ Reply to message above
  [2025-11-04T10:01:00Z] Bob in NEAR Developers: Check the docs

[MSG_3]     ↳ Reply to message above
    [2025-11-04T10:02:00Z] Alice in NEAR Developers: Thanks!
```

## UI Enhancements

### 4. Admin UI - Unprocessed Messages View

**File:** `/root/src/lionscraft-NearDocsAI/client/src/pages/Admin.tsx`

**Location:** Unprocessed messages list (around line 554)

**Current:**
```tsx
<p className="text-xs text-gray-500">
  Messages: {conv.message_count} • Created {new Date(conv.created_at).toLocaleString()}
</p>
```

**Enhanced:**
```tsx
<p className="text-xs text-gray-500">
  Messages: {conv.message_count}
  {conv.metadata?.replyToMessageId && (
    <> • Replying to: {conv.author} [{conv.metadata.replyToMessageId}]</>
  )}
  • Created {new Date(conv.created_at).toLocaleString()}
</p>
```

### 5. Admin UI - Conversation View with Indentation

**File:** `/root/src/lionscraft-NearDocsAI/client/src/pages/Admin.tsx`

**Location:** Conversation detail message list

**Add reply visualization component:**
```tsx
// Helper function to calculate reply depth
const calculateMessageDepth = (messages: any[], messageId: string): number => {
  const messageMap = new Map(messages.map(m => [m.messageId, m]));

  const getDepth = (msgId: string, visited: Set<string>): number => {
    if (visited.has(msgId)) return 0;
    const msg = messageMap.get(msgId);
    if (!msg?.metadata?.replyToMessageId) return 0;

    const replyToId = `${msg.metadata.chatId}-${msg.metadata.replyToMessageId}`;
    visited.add(msgId);
    return 1 + getDepth(replyToId, visited);
  };

  return getDepth(messageId, new Set());
};

// In conversation detail render:
{conversationMessages.map((msg) => {
  const depth = calculateMessageDepth(conversationMessages, msg.messageId);
  const indent = depth * 20; // 20px per level

  return (
    <div
      key={msg.id}
      className="border-b border-gray-100 py-3"
      style={{ paddingLeft: `${indent}px` }}
    >
      {depth > 0 && (
        <div className="text-xs text-gray-400 mb-1">
          ↳ Reply to message above
        </div>
      )}
      <div className="text-sm">
        <span className="font-medium">{msg.author}</span>
        <span className="text-gray-500 ml-2">
          {new Date(msg.timestamp).toLocaleString()}
        </span>
      </div>
      <div className="text-sm mt-1">{msg.content}</div>
    </div>
  );
})}
```

## Data Impact

**Database Queries:**
- **No new queries** - all data already present in message metadata
- Reply chain resolution happens in-memory within the batch

**Performance:**
- Building reply chain map: O(n) where n = batch size
- Depth calculation: O(d) where d = max depth (typically 2-5)
- Total overhead: ~1-2ms per batch (negligible)

**No Schema Changes Required:**
- `metadata.replyToMessageId` already captured by TelegramBotAdapter
- `metadata.chatId` already captured

## Testing Strategy

### Unit Tests

**File:** `/root/src/lionscraft-NearDocsAI/tests/telegram-reply-chain-visualization.test.ts`

**Test Cases:**
1. `buildReplyChainMap()`:
   - Single reply chain (A → B)
   - Nested reply chain (A → B → C)
   - Multiple independent threads
   - Reply to message outside batch (ignored)
   - Circular reference protection
   - Non-reply messages

2. `formatMessage()` with indentation:
   - Root message (depth 0, no indent)
   - First-level reply (depth 1, 2 spaces)
   - Second-level reply (depth 2, 4 spaces)
   - Message with reply outside batch (depth 0)

### Integration Tests

**File:** `/root/src/lionscraft-NearDocsAI/tests/batch-processor-integration.test.ts`

**Test Scenarios:**
1. End-to-end batch processing with reply chains
2. LLM prompt verification (includes indentation and arrows)
3. Mixed Telegram and non-Telegram messages
4. Performance test: 100 messages with reply chains

### Manual Testing

- [ ] Create Telegram test messages with 3-level reply chain
- [ ] Process batch and verify LLM prompt formatting
- [ ] Check Admin UI unprocessed messages view
- [ ] Check Admin UI conversation detail view
- [ ] Verify reply outside batch displays flat

## Error Handling

1. **Missing metadata fields:**
   - Gracefully treat as non-reply message (depth 0)
   - No errors or warnings

2. **Circular references:**
   - Protected by visited set in depth calculation
   - Falls back to depth 0

3. **Malformed messageId:**
   - Handled by Set lookup (will not match)
   - Message displays flat

## Rollout Plan

1. **Phase 1:** Backend implementation
   - Implement `buildReplyChainMap()`
   - Update `formatMessage()` with indentation
   - Unit tests

2. **Phase 2:** UI implementation
   - Add reply info to unprocessed view
   - Add indentation to conversation view
   - Manual verification

3. **Phase 3:** Production deployment
   - Deploy and monitor LLM prompt formatting
   - Verify no regressions in classification

## Future Enhancements

- Full conversation tree visualization (beyond immediate parent)
- Collapse/expand threads in UI
- Show reply preview on hover
- Thread summary for long conversations

## Approval

- [x] Story reviewed and approved
- [ ] Spec reviewed and approved by Wayne
- [ ] Implementation completed
- [ ] Tests passing
- [ ] Deployed to production
