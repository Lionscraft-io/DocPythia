# Story: Telegram Reply Chain Visualization for Enhanced LLM Context

**Author:** Wayne
**Date:** 2025-11-04
**Status:** Approved
**Complexity:** Moderate

## Context

The NearDocsAI batch message processor analyzes Telegram messages using LLMs to identify documentation-relevant conversations. Currently, the LLM receives only flat message lists with basic metadata: timestamp, author, channel, and plain text content (which already includes inline URLs). This flat formatting loses critical conversational structure:

**Missing Reply Thread Visualization:** When users reply to previous messages, the LLM cannot see the conversation threading structure. Reply chains appear as disconnected flat messages, making it difficult for the LLM to understand that messages form coherent discussions about specific topics.

The TelegramBotAdapter already captures `replyToMessageId` in metadata (line 227), but the batch processor's `formatMessage()` function (line 367-368) ignores this relationship when constructing the LLM prompt.

## Problem Statement

The LLM makes documentation relevance decisions without understanding conversation structure, leading to:
- False negatives: Missing documentation-relevant threads because reply relationships are invisible
- Poor conversation threading: Cannot see that messages form coherent multi-turn discussions
- Reduced accuracy: Cannot understand that a reply is continuing a documentation-relevant discussion

## Desired Outcome

When the batch processor formats messages for LLM analysis, **visualize reply chains using indentation and arrows** (like threaded forum posts):

**Example formatting:**
```
[2025-11-04T10:15:00Z] Bob in NEAR Developers: Did you follow the contract deployment guide?

  ↳ Reply to message above
  [2025-11-04T10:30:00Z] Alice in NEAR Developers: I'm getting this error when deploying https://github.com/near/near-sdk-rs/issues/1234

    ↳ Reply to message above
    [2025-11-04T10:35:00Z] Charlie in NEAR Developers: Check your gas configuration
```

**Key behaviors:**
- 2-space indentation per reply level
- `↳ Reply to message above` indicator before each reply
- Links stay inline in message text (already there)
- Only show reply structure if the original message IS in the current batch
- If original message not in batch: display message flat (no reply indicator)

This threading visualization enables the LLM to understand conversation structure for better documentation relevance decisions.

## Acceptance Criteria

### AC1: Reply Chain Indentation (Messages in Batch)
- **Given** a batch of Telegram messages where Message B replies to Message A (both in same batch)
- **When** the batch processor formats messages for LLM analysis
- **Then** Message B is displayed with 2-space indentation and `↳ Reply to message above` indicator

### AC2: Nested Reply Indentation
- **Given** a 3-level reply chain: A → B → C (all in same batch)
- **When** formatted for LLM
- **Then** B has 2-space indent, C has 4-space indent, each with arrow indicator

### AC3: Missing Reply Handling (Original Not in Batch)
- **Given** Message B replies to Message A, but Message A is NOT in the current batch
- **When** the formatter processes Message B
- **Then** Message B is displayed flat (no indentation, no reply indicator), no errors logged

### AC4: UI - Unprocessed Messages View
- **Given** an unprocessed message with `replyToMessageId` in Admin UI
- **When** displayed in the unprocessed messages list
- **Then** show `Replying to: [original author] [id]`

### AC5: UI - Conversation View Threading
- **Given** a classified conversation with reply chains in Admin UI
- **When** displayed in the conversation detail view
- **Then** replies are visually indented to show thread structure

### AC6: Backward Compatibility
- **Given** messages from non-Telegram sources (Zulip, CSV) or Telegram messages without replies
- **When** the formatter processes these messages
- **Then** they display flat without errors (no indentation or reply indicators)

## Out of Scope

- Building full conversation trees (only showing immediate parent-child relationships)
- Extracting media content (images, videos, files) from Telegram
- Modifying how `rawData` or `metadata` are initially captured (already correct)
- Changing LLM analysis logic or classification categories
- URL extraction (URLs already present inline in message text)
- Fetching messages outside the current batch to show reply context

## Dependencies

- Existing: `server/stream/adapters/telegram-bot-adapter.ts` (captures replyToMessageId in metadata)
- Existing: `server/stream/processors/batch-message-processor.ts` (formatMessage function)
- Existing: Prisma `UnifiedMessage` model with `metadata` JSON field
- Frontend: `client/src/pages/Admin.tsx` (unprocessed and conversation views)

## Success Metrics

- LLM classification accuracy improves for threaded conversations
- Reply indentation displayed correctly for 100% of reply chains where original is in batch
- UI shows reply information in both unprocessed and conversation views
- No errors when processing non-Telegram or non-reply messages

## Related Documentation

- **Spec:** `/docs/specs/telegram-reply-chain-visualization.md`
- **Reference:** `/docs/specs/telegram-bot-integration.md` (existing Telegram adapter spec)
- **Reference:** `/docs/specs/multi-stream-scanner-phase-1.md` (batch processing architecture)
