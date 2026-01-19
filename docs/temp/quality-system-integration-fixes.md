# Quality System Integration Fixes

**Author**: Wayne
**Date**: 2026-01-19
**Status**: Completed

## Overview

This document describes the fixes needed to integrate the Quality System features into the actual processing pipeline. The features were built but not wired into the production flow.

## Gap Analysis

### Gap 1: Pipeline Configs Missing New Steps

**Problem**: Pipeline configuration files don't include `context-enrich` or `ruleset-review` steps.

**Files Affected**:
- `config/defaults/pipelines/default.json`
- `config/near/pipelines/default.json`

**Fix**: Add the new steps to pipeline configurations in the correct order:
1. filter → 2. classify → 3. enrich (RAG) → 4. generate → 5. **context-enrich** → 6. **ruleset-review** → 7. validate → 8. condense

---

### Gap 2: PipelineRunLog Never Written

**Problem**: The `PipelineRunLog` table exists but nothing writes to it. The Pipeline Debugger UI shows no data.

**Fix**: Add logging to `PipelineOrchestrator.execute()` to record:
- Pipeline start (status: running)
- Step execution details
- Pipeline completion (status: completed/failed)

---

### Gap 3: Batch Processor Bypasses Pipeline

**Problem**: `batch-message-processor.ts` makes direct LLM calls for classification and proposal generation, only using the pipeline orchestrator for post-processing steps (VALIDATE/CONDENSE).

**Current Flow**:
```
BatchMessageProcessor:
  1. classifyMessageBatch() → Direct LLM call with PROMPT_TEMPLATES
  2. generateChangesetForConversation() → Direct LLM call with PROMPT_TEMPLATES
  3. postProcessProposals() → Uses PipelineOrchestrator (VALIDATE, CONDENSE only)
  4. storeProposal() → Saves to DB without enrichment
```

**Fix Options**:

**Option A: Full Pipeline Migration** (Recommended)
- Refactor batch processor to use PipelineOrchestrator for the entire flow
- All steps run through configurable pipeline
- More maintainable long-term

**Option B: Hybrid Integration**
- Keep existing LLM calls for classify/generate
- Add enrichment and ruleset review after proposal generation
- Add PROMPT_CONTEXT injection to existing changeset generation
- Less refactoring but more code paths

**Selected**: Option B (Hybrid) - Lower risk, faster implementation

---

### Gap 4: PROMPT_CONTEXT Not Injected

**Problem**: `ProposalGenerateStep` has PROMPT_CONTEXT injection, but batch-message-processor doesn't use it.

**Fix**: In `generateChangesetForConversation()`:
1. Load tenant ruleset
2. Parse PROMPT_CONTEXT section
3. Append to system prompt before LLM call

---

### Gap 5: Enrichment Not Persisted

**Problem**: `docProposal.create()` doesn't include the `enrichment` field.

**Fix**: After running enrichment:
1. Pass enrichment data through proposal flow
2. Include `enrichment` field in `docProposal.create()`

---

## Implementation Plan

### Phase 1: Add Pipeline Logging
1. Update `PipelineOrchestrator` to write `PipelineRunLog`
2. Record step timings and metadata

### Phase 2: Integrate PROMPT_CONTEXT Injection
1. Add ruleset loading to batch-message-processor
2. Inject PROMPT_CONTEXT into changeset generation prompt

### Phase 3: Add Enrichment to Processing Flow
1. Call `ContextEnrichmentStep` after proposal generation
2. Pass enrichment data through to storage
3. Update `docProposal.create()` to include enrichment

### Phase 4: Add Ruleset Review to Processing Flow
1. Call `RulesetReviewStep` after enrichment
2. Handle rejections (skip storing rejected proposals)
3. Apply modifications to proposal content
4. Store quality flags

### Phase 5: Update Pipeline Configs
1. Add `context-enrich` step to default pipeline
2. Add `ruleset-review` step to default pipeline
3. Update near instance pipeline

---

## Data Flow After Fix

```
BatchMessageProcessor.processBatch():
  │
  ├─ classifyMessageBatch()
  │   └─ LLM classification (unchanged)
  │
  ├─ For each valuable conversation:
  │   │
  │   ├─ generateChangesetForConversation()
  │   │   ├─ Load tenant ruleset (NEW)
  │   │   ├─ Inject PROMPT_CONTEXT into prompt (NEW)
  │   │   └─ LLM proposal generation
  │   │
  │   ├─ enrichProposals() (NEW)
  │   │   └─ ContextEnrichmentStep.execute()
  │   │       ├─ Find related docs
  │   │       ├─ Check duplication
  │   │       ├─ Analyze style
  │   │       └─ Calculate change context
  │   │
  │   ├─ applyRulesetReview() (NEW)
  │   │   └─ RulesetReviewStep.execute()
  │   │       ├─ Check REJECTION_RULES → skip if rejected
  │   │       ├─ Apply REVIEW_MODIFICATIONS
  │   │       └─ Check QUALITY_GATES → add flags
  │   │
  │   ├─ postProcessProposals()
  │   │   └─ PipelineOrchestrator (VALIDATE, CONDENSE)
  │   │
  │   └─ storeProposal()
  │       └─ Include enrichment data (UPDATED)
  │
  └─ logPipelineRun() (NEW)
      └─ Write to PipelineRunLog
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/pipeline/core/PipelineOrchestrator.ts` | Add PipelineRunLog writes |
| `server/stream/processors/batch-message-processor.ts` | Add ruleset loading, PROMPT_CONTEXT injection, enrichment call, ruleset review call, enrichment persistence |
| `config/defaults/pipelines/default.json` | Add context-enrich and ruleset-review steps |
| `config/near/pipelines/default.json` | Add context-enrich and ruleset-review steps |

---

## Testing Plan

1. **Unit Tests**: Verify each new integration point
2. **Integration Test**: Run full batch with ruleset configured
3. **UI Verification**:
   - Pipeline Debugger shows runs
   - ReviewContextPanel shows enrichment data
   - Ruleset modifications are applied

---

## Rollback Plan

All changes are additive. To rollback:
1. Remove new steps from pipeline configs
2. Disable enrichment/ruleset calls in batch-processor (flag-based)
