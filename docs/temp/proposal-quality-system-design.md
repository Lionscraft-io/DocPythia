# Proposal Quality System Design

**Author**: Wayne
**Date**: 2026-01-09
**Status**: Draft - For Review

## Overview

This document describes a proposed system to improve documentation proposal quality through three interconnected features:

1. **Prompt Management & Testing** - Visibility and control over pipeline prompts
2. **Context Enrichment** - RAG-based analysis to provide review context
3. **Tenant Rulesets** - Configurable rules that can modify, reject, or flag proposals

These features work together to give tenants control over proposal quality while maintaining transparency and reducing manual review burden.

---

## 1. Prompt Management & Testing

### 1.1 Prompts Overview Page

A new admin page that displays all prompts used in the pipeline, showing:
- Default prompts (from codebase)
- Tenant overrides (if configured)
- Which version is currently active

**Capabilities:**
- View full prompt content for each pipeline step
- Create tenant-specific overrides
- Reset overrides to default
- See where tenant ruleset PROMPT_CONTEXT is injected

**Prompts Covered:**
| Pipeline Step | Prompts |
|---------------|---------|
| Thread Classification | System prompt, User prompt |
| Changeset Generation | System prompt, User prompt |
| Ruleset Review | System prompt (new) |
| Context Enrichment | Analysis prompts (new) |

### 1.2 Pipeline Debugger

A testing interface to inspect and replay pipeline steps.

**Features:**
- Select any historical batch
- View input/output for each pipeline step
- See which prompts were used (default vs override)
- Rerun any step with modified prompts (test mode - does not save)
- Compare test results with original results

**Use Cases:**
- Debug why a proposal was generated incorrectly
- Test prompt changes before deploying
- Understand how ruleset changes would affect past batches
- Train new team members on pipeline behavior

### 1.3 Data Model

```
TenantPromptOverride
├── id
├── tenant_id
├── prompt_key (e.g., "threadClassification.system")
├── content
├── updated_at
```

---

## 2. Context Enrichment

### 2.1 Purpose

Analyze each proposal after generation to provide structured context data that:
- Helps reviewers make informed decisions
- Enables ruleset rules to reference objective metrics
- Surfaces potential issues (duplicates, inconsistencies)

### 2.2 Pipeline Position

```
Thread Classification
       ↓
Changeset Generation
       ↓
[Context Enrichment] ← NEW: Produces structured analysis
       ↓
[Ruleset Review] ← Can reference enrichment data
       ↓
Save Proposals
```

Enrichment runs BEFORE ruleset review so rules can reference the analysis.

### 2.3 Enrichment Data Structure

```typescript
interface ProposalEnrichment {
  // Related documentation (from RAG)
  relatedDocs: {
    page: string;
    section: string;
    similarityScore: number;  // 0-1
    matchType: 'semantic' | 'keyword' | 'same-section';
    snippet: string;
  }[];

  // Duplication detection
  duplicationWarning: {
    detected: boolean;
    matchingPage?: string;
    matchingSection?: string;
    overlapPercentage?: number;
  };

  // Style consistency analysis
  styleAnalysis: {
    targetPageStyle: {
      avgSentenceLength: number;
      usesCodeExamples: boolean;
      formatPattern: 'prose' | 'bullets' | 'mixed';
      technicalDepth: 'beginner' | 'intermediate' | 'advanced';
    };
    proposalStyle: {
      avgSentenceLength: number;
      usesCodeExamples: boolean;
      formatPattern: 'prose' | 'bullets' | 'mixed';
      technicalDepth: 'beginner' | 'intermediate' | 'advanced';
    };
    consistencyNotes: string[];
  };

  // Change impact
  changeContext: {
    targetSectionCharCount: number;
    proposalCharCount: number;
    changePercentage: number;
    lastUpdated: Date | null;
    otherPendingProposals: number;
  };

  // Source conversation analysis
  sourceAnalysis: {
    messageCount: number;
    uniqueAuthors: number;
    threadHadConsensus: boolean;
    conversationSummary: string;
  };
}
```

### 2.4 Analysis Methods

| Analysis | Method |
|----------|--------|
| Related Docs | RAG search using proposal text as query |
| Duplication | Cosine similarity on embeddings, n-gram overlap |
| Style Analysis | LLM analysis + rule-based metrics (sentence length, format detection) |
| Change Impact | Compare proposal length to existing section |
| Source Analysis | Aggregate from linked conversation data |

### 2.5 Review UI Display

Enrichment data displayed in collapsible "Review Context" panel:
- Related documentation with similarity scores
- Duplication warnings
- Style consistency notes
- Change impact metrics
- Source conversation summary

---

## 3. Tenant Rulesets

### 3.1 Purpose

Allow tenants to configure rules that automatically:
- Inject context into generation prompts
- Modify proposals for consistency
- Reject proposals matching criteria
- Flag proposals for reviewer attention

### 3.2 Ruleset Structure

Convention-based markdown with action-based sections:

```markdown
# Documentation Ruleset

## PROMPT_CONTEXT
<!-- Injected into changeset generation prompt -->
- Our documentation targets intermediate developers
- Use "validator" not "node operator"
- All RPC examples should include error handling

## REVIEW_MODIFICATIONS
<!-- Applied to proposals after enrichment, can reference enrichment data -->
- If styleAnalysis shows formatPattern mismatch, adjust to match target page
- If avgSentenceLength differs by >50% from target, adjust for consistency
- Shorten any suggestedText exceeding 1500 characters

## REJECTION_RULES
<!-- Auto-reject proposals matching these criteria -->
- If similarityScore > 0.85 with existing docs, reject as duplicate
- If duplicationWarning.overlapPercentage > 75%, reject as redundant
- Proposals mentioning competitor protocols

## QUALITY_GATES
<!-- Flag for reviewer attention without rejecting -->
- If styleAnalysis.consistencyNotes is not empty, flag for style review
- If changePercentage > 50%, flag as significant change
- If otherPendingProposals > 0, flag for coordination
```

### 3.3 Section Behaviors

| Section | When Applied | Effect |
|---------|--------------|--------|
| `PROMPT_CONTEXT` | Before changeset generation | Appended to LLM prompt |
| `REVIEW_MODIFICATIONS` | After enrichment | LLM rewrites proposals per rules |
| `REJECTION_RULES` | After modifications | Auto-reject with logged reason |
| `QUALITY_GATES` | After rejection check | Add flags to proposal metadata |

### 3.4 Enrichment Data Available to Rules

Rules in REVIEW_MODIFICATIONS, REJECTION_RULES, and QUALITY_GATES can reference:

| Field | Example Usage |
|-------|---------------|
| `relatedDocs[].similarityScore` | Reject if >0.85 (duplicate) |
| `duplicationWarning.overlapPercentage` | Reject if >70% |
| `styleAnalysis.formatPattern` | Convert prose↔bullets |
| `styleAnalysis.avgSentenceLength` | Adjust verbosity |
| `styleAnalysis.technicalDepth` | Adjust complexity |
| `changeContext.changePercentage` | Flag large changes |
| `changeContext.otherPendingProposals` | Flag conflicts |
| `sourceAnalysis.messageCount` | Require evidence for big changes |

### 3.5 Ruleset Management Page

**Features:**
- Edit ruleset content (markdown editor)
- View unprocessed feedback count
- Generate ruleset improvements from feedback
- Preview diff before saving

### 3.6 Feedback Collection

When approving/rejecting proposals:
- Optional feedback text field
- Checkbox: "Use this feedback to improve ruleset"

Feedback stored for later consumption by ruleset improvement feature.

### 3.7 Ruleset Improvement Workflow

1. User clicks "Generate Improvements" on ruleset page
2. System sends unprocessed feedback to LLM
3. LLM suggests ruleset modifications
4. User sees diff of current vs suggested
5. User can edit before saving
6. Saving marks feedback as processed

### 3.8 Data Model

```
TenantRuleset
├── id
├── tenant_id
├── content (markdown)
├── updated_at

RulesetFeedback
├── id
├── tenant_id
├── proposal_id
├── action_taken (approved | rejected | ignored)
├── feedback_text
├── created_at
├── processed_at

ProposalReviewLog
├── id
├── proposal_id
├── original_content
├── modifications_applied (JSON)
├── rejected (boolean)
├── rejection_reason
├── quality_flags (JSON array)
├── created_at
```

---

## 4. Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Thread Classification                                    │
│    - Groups messages into conversation threads              │
│    - Prompt: default or tenant override                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Changeset Generation                                     │
│    - Generates proposals from valuable threads              │
│    - Prompt: default + PROMPT_CONTEXT from ruleset          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Context Enrichment (NEW)                                 │
│    - RAG search for related documentation                   │
│    - Compute similarity scores                              │
│    - Analyze style consistency                              │
│    - Calculate change impact                                │
│    - Summarize source conversation                          │
│    Output: ProposalEnrichment for each proposal             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Ruleset Review (NEW)                                     │
│    Input: Proposals + Enrichment + Tenant Ruleset           │
│                                                             │
│    a. Check REJECTION_RULES against enrichment              │
│       → Auto-reject matches, log reason                     │
│                                                             │
│    b. Apply REVIEW_MODIFICATIONS                            │
│       → LLM rewrites using enrichment context               │
│       → Log modifications                                   │
│                                                             │
│    c. Check QUALITY_GATES                                   │
│       → Add flags to proposal metadata                      │
│                                                             │
│    Output: Modified proposals + review logs                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Save Proposals                                           │
│    - Proposal content (possibly modified)                   │
│    - Enrichment data                                        │
│    - Review log (actions taken)                             │
│    - Quality flags                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. UI Components Summary

| Component | Purpose |
|-----------|---------|
| Prompts Overview Page | View/edit all pipeline prompts |
| Pipeline Debugger | Inspect steps, test prompt changes |
| Ruleset Editor Page | Edit tenant ruleset markdown |
| Ruleset Feedback Panel | Generate improvements from feedback |
| Review Context Panel | Display enrichment data during review |
| Feedback Input | Collect feedback on approval/rejection |

---

## 6. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Eager enrichment (not lazy) | Enables ruleset rules to reference enrichment data |
| Convention-based markdown | Flexible for tenants, LLM can interpret free-form rules |
| No ruleset versioning | Complexity not justified; just use latest |
| No confidence scores | LLMs not reliable for self-assessment |
| Single default template | Avoid template proliferation |
| Transparent logging | All actions recorded but no extra approval steps |

---

## 7. Implementation Phases

**Phase 1: Foundation**
- TenantRuleset and TenantPromptOverride data models
- Prompts Overview page (read-only initially)
- Basic ruleset editor page

**Phase 2: Enrichment**
- Context Enrichment pipeline step
- Enrichment data storage
- Review UI context panel

**Phase 3: Ruleset Processing**
- Ruleset Review pipeline step
- PROMPT_CONTEXT injection
- REVIEW_MODIFICATIONS processing
- REJECTION_RULES evaluation
- QUALITY_GATES flagging

**Phase 4: Feedback Loop**
- Feedback collection on approval/rejection
- Ruleset improvement generation
- Diff preview and editing

**Phase 5: Testing Tools**
- Pipeline Debugger
- Prompt override editing
- Test run comparison

---

## 8. Open Questions

1. Should rejected proposals be completely hidden or shown in a "Rejected by Ruleset" tab?
2. How to handle conflicting feedback when generating ruleset improvements?
3. Should enrichment analysis use a lighter/faster model than main generation?
4. Rate limiting on ruleset improvement generation?

---

## 9. Related Files

- `server/stream/llm/prompt-templates.ts` - Current prompt definitions
- `server/stream/processors/batch-message-processor.ts` - Current pipeline
- `config/defaults/prompts/` - Externalized prompt files
