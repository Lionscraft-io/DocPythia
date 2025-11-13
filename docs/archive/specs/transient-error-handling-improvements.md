# Transient Error Handling Improvements

**Date**: 2025-10-30
**Author**: Claude
**Issue**: Messages failing with transient LLM errors (empty responses, malformed JSON) and being marked as FAILED after 3 attempts, despite passing when manually retried.

## Problem Analysis

The system was encountering two types of transient errors:

1. **Empty LLM Responses**: `Error: Empty response from LLM` at line 123 of llm-service.ts
   - Likely caused by API timeouts or rate limiting

2. **Malformed JSON**: `SyntaxError: Unterminated string in JSON at position 482` at line 127
   - Likely caused by incomplete responses due to timeouts or interruptions

These errors were transient (intermittent) rather than permanent, as evidenced by messages passing when manually rerun.

## Root Cause

The retry logic wasn't distinguishing between:
- **Transient errors** (should retry with longer delays): empty responses, malformed JSON, API errors
- **Permanent errors** (should fail quickly): invalid prompts, schema mismatches

All errors were treated equally, leading to premature FAILED status for messages that could succeed with better retry logic.

## Solutions Implemented

### 1. Error Classification System

**File**: `/root/src/lionscraft-NearDocsAI/server/stream/llm/llm-service.ts`

Added `transient` flag to errors that should be retried with longer delays:

```typescript
// Empty response handling
if (!rawJson) {
  const err = new Error('Empty response from LLM - possibly rate limited or timeout');
  (err as any).transient = true; // Mark as transient
  throw err;
}

// Malformed JSON handling
const err = new Error(`Malformed JSON response: ${parseError.message}`);
(err as any).transient = true; // Mark as transient
throw err;

// API error handling
const err = new Error(`Gemini API error: ${apiError.message}`);
(err as any).transient = true; // Mark as transient
throw err;
```

### 2. Enhanced Error Logging

**File**: `/root/src/lionscraft-NearDocsAI/server/stream/llm/llm-service.ts:132-146`

Added detailed logging when JSON parsing fails:

```typescript
console.error('❌ JSON PARSE ERROR');
console.error('Parse Error:', parseError);
console.error('Raw JSON (first 1000 chars):', rawJson.substring(0, 1000));
console.error('Raw JSON (last 200 chars):', rawJson.substring(Math.max(0, rawJson.length - 200)));
console.error('JSON Length:', rawJson.length);
```

This helps diagnose:
- Where the JSON is malformed
- Whether response was truncated
- If there are specific patterns to the failures

### 3. Adaptive Retry Delays

**File**: `/root/src/lionscraft-NearDocsAI/server/stream/llm/llm-service.ts:52-77`

Updated retry logic to use longer delays for transient errors:

**Base delay**: Increased from 1s to 2s
**Transient error multiplier**: 2x longer delays

**New delay schedule for transient errors**:
- Attempt 1 fails → wait **4 seconds** (2s × 2^0 × 2)
- Attempt 2 fails → wait **8 seconds** (2s × 2^1 × 2)
- Attempt 3 fails → give up

**Delay schedule for permanent errors**:
- Attempt 1 fails → wait **2 seconds** (2s × 2^0 × 1)
- Attempt 2 fails → wait **4 seconds** (2s × 2^1 × 1)
- Attempt 3 fails → give up

### 4. More Conservative Rate Limiting

**File**: `/root/src/lionscraft-NearDocsAI/server/stream/processors/message-processor.ts:42`

Increased rate limit delay between messages:
- **Before**: 6 seconds (10 requests per minute)
- **After**: 8 seconds (7.5 requests per minute)

This provides more breathing room for the Gemini API and reduces likelihood of rate limiting.

### 5. API Error Handling

**File**: `/root/src/lionscraft-NearDocsAI/server/stream/llm/llm-service.ts:112-126`

Added separate try-catch for Gemini API errors (before response parsing):

```typescript
try {
  result = await model.generateContent(prompt);
} catch (apiError) {
  // Catch API errors (rate limiting, network issues)
  const err = new Error(`Gemini API error: ${apiError.message}`);
  (err as any).transient = true;
  throw err;
}
```

## Expected Outcomes

1. **Fewer FAILED messages**: Transient errors will have more time to recover with longer retry delays
2. **Better diagnostics**: Enhanced logging will show exactly what's failing when JSON is malformed
3. **Less API pressure**: 8-second intervals reduce overall request rate
4. **Smarter retries**: System now knows when to wait longer vs fail fast

## Testing Recommendations

1. **Monitor error logs**: Look for "TRANSIENT (will retry)" vs "PERMANENT" in error logs
2. **Check retry patterns**: Verify that transient errors wait 4s/8s before retry
3. **Track FAILED count**: Should decrease compared to previous behavior
4. **Review JSON parse errors**: If they persist, the detailed logs will show patterns

## Related Files

- `/root/src/lionscraft-NearDocsAI/server/stream/llm/llm-service.ts` - Core LLM service with retry logic
- `/root/src/lionscraft-NearDocsAI/server/stream/processors/message-processor.ts` - Message processing with rate limiting
- `/root/src/lionscraft-NearDocsAI/prisma/schema.prisma` - Database schema with failure tracking

## Future Improvements

If transient errors continue:

1. **Exponential backoff at message level**: Currently only at LLM request level
2. **Circuit breaker pattern**: Temporarily stop processing if API is consistently failing
3. **Request queuing**: Queue requests instead of rate limiting with delays
4. **Dynamic rate adjustment**: Adjust rate based on observed error rates
5. **Retry budget**: Limit total retry time per message to avoid infinite loops

## Monitoring Metrics

Key metrics to watch:
- `FAILED` count in admin stats
- Frequency of "TRANSIENT" errors in logs
- Average time per message processing
- Success rate on 1st vs 2nd vs 3rd attempt
