# Spec: Multi-Stream Message Scanner - Phase 2: Batch Aggregation & PR Generation

**Developer:** Wayne
**Created:** 2025-10-30
**Status:** Draft
**Phase:** 2 of 2
**Story:** [/docs/stories/multi-stream-message-scanner.md](/docs/stories/multi-stream-message-scanner.md)
**Prerequisite:** [Phase 1 Spec](/docs/specs/multi-stream-scanner-phase-1.md)

## Overview

Phase 2 implements the automated pull request generation system that takes approved documentation updates from Phase 1, aggregates them into coherent batches, validates repository state, and creates pull requests for documentation changes. This phase focuses on the automation of turning approved changes into mergeable PRs.

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Phase 1 Output                          │
│  (Approved Documentation Updates)                │
└────────────────────┬────────────────────────────┘
                     │
           ┌─────────▼──────────┐
           │  Batch Aggregator  │
           │  - Group by page   │
           │  - Merge adjacent  │
           │  - Detect conflicts│
           └─────────┬──────────┘
                     │
           ┌─────────▼──────────┐
           │  Repository State   │
           │  Validator          │
           │  - Check git status │
           │  - Verify base     │
           └─────────┬──────────┘
                     │
           ┌─────────▼──────────┐
           │  PR Generator       │
           │  (LLM-4)            │
           │  - Synthesize edits │
           │  - Format PR       │
           └─────────┬──────────┘
                     │
           ┌─────────▼──────────┐
           │  Git Operations     │
           │  - Create branch    │
           │  - Commit changes  │
           │  - Open PR        │
           └─────────┬──────────┘
                     │
           ┌─────────▼──────────┐
           │  Post-PR Handler    │
           │  - Track status     │
           │  - Update records  │
           │  - Notify admins  │
           └────────────────────┘
```

## Processing Pipeline

### 6. Batch Aggregation

**Goal**: Combine all approved patches into batch sets by file.

**Process**:
1. Collect all `approved=true` updates since last batch run
2. Group by target page/file
3. Sort by character range (for sequential application)
4. Detect and resolve conflicts (overlapping ranges)
5. Merge adjacent/compatible edits

**Output**:
```json
{
  "batch_id": "batch_2025_10_30_001",
  "pages": [
    {
      "page": "api.md",
      "changes": [
        {
          "type": "UPDATE",
          "range": [100, 200],
          "new_text": "...",
          "source_proposals": [123, 124]
        },
        {
          "type": "INSERT",
          "range": [500, 500],
          "new_text": "...",
          "source_proposals": [125]
        }
      ]
    }
  ],
  "total_changes": 5,
  "affected_pages": 2
}
```

### 7. Repository State Validation

**Goal**: Ensure safe base for commit.

**Steps**:
1. `git fetch origin main`
2. Compare commit hash of local branch vs origin/main
3. Check for any pending unmerged PRs from this system
4. If base is stale or conflicts exist:
   - Mark batch as stale
   - Block PR creation
   - Re-run Update + Review passes against latest main

**Validation Rules**:
- No syncing while pending unmerged changes exist
- Base must be current main branch
- No uncommitted changes in working directory

### 8. Pull Request Generation (LLM-4)

**Goal**: Synthesize coherent PR from batched approved patches.

**Process**:
1. Merge text edits and normalize phrasing
2. Build unified diffs
3. Generate PR title and description
4. Create commit message(s)

**Output**:
```json
{
  "branch_name": "auto-doc-update-2025-10-30",
  "commits": [
    {
      "message": "Update API documentation with rate limiting info",
      "files": [
        {
          "path": "docs/api.md",
          "diff": "@@ -100,7 +100,10 @@..."
        }
      ]
    }
  ],
  "pull_request": {
    "title": "Automated Documentation Updates - 2025-10-30",
    "body": "## Summary\n\nThis PR contains automated documentation updates...",
    "labels": ["documentation", "automated"],
    "reviewers": ["team-lead"]
  }
}
```

### 9. Post-PR Handling

**Goal**: Maintain traceability and system state.

**Steps**:
1. Record PR URL and metadata in database
2. Mark associated message_analysis records as `pr_created`
3. Update batch status to `pr_opened`
4. Send notifications to configured admins
5. Monitor PR status (via webhooks or polling)
6. On merge: update records with merged commit hash
7. On close/reject: mark batch for re-analysis

## Database Schema (Phase 2 additions)

```sql
-- Batch aggregation records
CREATE TABLE doc_batches (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL, -- pending|processing|pr_created|merged|failed
  total_changes INTEGER NOT NULL,
  affected_pages INTEGER NOT NULL,
  aggregation_data JSONB NOT NULL,
  pr_url VARCHAR(255),
  pr_number INTEGER,
  branch_name VARCHAR(100),
  merged_commit_hash VARCHAR(40),
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  merged_at TIMESTAMP
);

-- Link proposals to batches
CREATE TABLE batch_proposals (
  batch_id INTEGER REFERENCES doc_batches(id),
  proposal_id INTEGER REFERENCES doc_proposals(id),
  PRIMARY KEY (batch_id, proposal_id)
);

-- Repository state tracking
CREATE TABLE repo_state (
  id SERIAL PRIMARY KEY,
  repo_url VARCHAR(255) NOT NULL,
  branch VARCHAR(100) NOT NULL,
  last_known_hash VARCHAR(40) NOT NULL,
  last_pr_hash VARCHAR(40),
  has_pending_pr BOOLEAN DEFAULT false,
  pending_pr_url VARCHAR(255),
  checked_at TIMESTAMP DEFAULT NOW()
);

-- PR generation audit log
CREATE TABLE pr_generation_log (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES doc_batches(id),
  step VARCHAR(50) NOT NULL, -- validation|generation|commit|pr_creation
  status VARCHAR(20) NOT NULL, -- started|success|failed
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## LLM Prompts (Phase 2)

### Pull Request Synthesis (LLM-4)

```typescript
const prSynthesisPrompt = `
You are an automated documentation maintainer.
Prepare a single pull request from a batch of approved edits.

Inputs:
Approved changes (JSON array):
[{page: "...", changes: [{type: "...", range: [..], new_text: "..."}]}, ...]

Rejected changes (for context):
[{page: "...", reason: "..."}]

Style guide:
{style_rules}

Commit history summary:
{recent_commit_summaries}

Tasks:
1. Merge and normalize edits.
2. Ensure consistent tone and formatting.
3. Prepare a PR title and summary body.

Output JSON:
{
  "branch_name": "auto-doc-update-{date}",
  "commit_summary": "{short_summary}",
  "pull_request": {
    "title": "{title}",
    "body": "{summary_with_list_of_changes}",
    "files": [
      {"path": "docs/{file}.md", "diff": "{unified_diff}"}
    ]
  }
}

Rules:
- Do not include rejected or low-confidence edits.
- Mention pages and topics updated in the PR body.
- Maintain Markdown formatting.
- Group related changes in the description.
- Use clear, professional commit messages.
`;
```

### Conflict Resolution (Optional LLM-5)

```typescript
const conflictResolutionPrompt = `
You are resolving conflicts between multiple approved documentation edits.

Conflicting edits for {page}:
Edit 1: {range: [100, 200], text: "..."}
Edit 2: {range: [150, 250], text: "..."}

Current document excerpt:
"""{current_text}"""

Task:
1. Determine if edits can be merged
2. If yes, provide merged text
3. If no, choose the higher confidence edit

Output JSON:
{
  "can_merge": true|false,
  "resolution": "merge|edit1|edit2",
  "merged_text": "{text_if_merged}",
  "reasoning": "{explanation}"
}
`;
```

## Implementation Components

### 1. Batch Aggregator

```typescript
export class BatchAggregator {
  async createBatch(): Promise<DocBatch> {
    // Get all approved reviews since last batch
    const approvedReviews = await this.getApprovedReviews();

    if (approvedReviews.length === 0) {
      throw new Error('No approved reviews to batch');
    }

    // Group by page
    const pageGroups = this.groupByPage(approvedReviews);

    // Process each page
    const batchData = {
      batch_id: this.generateBatchId(),
      pages: []
    };

    for (const [page, reviews] of pageGroups.entries()) {
      const changes = await this.processPageChanges(page, reviews);
      batchData.pages.push({
        page,
        changes
      });
    }

    // Store batch
    const batch = await this.storeBatch(batchData);
    await this.linkProposalsToBatch(batch.id, approvedReviews);

    return batch;
  }

  private async processPageChanges(page: string, reviews: Review[]): Promise<Change[]> {
    // Sort by character range
    const sorted = reviews.sort((a, b) =>
      a.proposal.character_range[0] - b.proposal.character_range[0]
    );

    // Detect conflicts
    const conflicts = this.detectConflicts(sorted);

    if (conflicts.length > 0) {
      // Resolve conflicts (may use LLM or rules)
      return await this.resolveConflicts(sorted, conflicts);
    }

    // Merge adjacent edits where possible
    return this.mergeAdjacentEdits(sorted);
  }

  private detectConflicts(reviews: Review[]): Conflict[] {
    const conflicts = [];

    for (let i = 0; i < reviews.length - 1; i++) {
      const current = reviews[i].proposal.character_range;
      const next = reviews[i + 1].proposal.character_range;

      if (current[1] > next[0]) {
        // Ranges overlap
        conflicts.push({
          index1: i,
          index2: i + 1,
          type: 'overlapping_range'
        });
      }
    }

    return conflicts;
  }
}
```

### 2. Repository Manager

```typescript
export class RepositoryManager {
  private gitClient: SimpleGit;
  private repoPath: string;

  async validateState(): Promise<ValidationResult> {
    // Fetch latest from origin
    await this.gitClient.fetch('origin', 'main');

    // Get current and remote hashes
    const localHash = await this.gitClient.revparse(['HEAD']);
    const remoteHash = await this.gitClient.revparse(['origin/main']);

    // Check for pending PRs
    const hasPendingPR = await this.checkPendingPRs();

    return {
      isValid: localHash === remoteHash && !hasPendingPR,
      localHash,
      remoteHash,
      hasPendingPR,
      needsRebase: localHash !== remoteHash
    };
  }

  async createBranch(branchName: string): Promise<void> {
    // Ensure we're on main
    await this.gitClient.checkout('main');

    // Pull latest
    await this.gitClient.pull('origin', 'main');

    // Create and checkout new branch
    await this.gitClient.checkoutLocalBranch(branchName);
  }

  async applyChanges(files: FileChange[]): Promise<void> {
    for (const file of files) {
      // Read current content
      const currentContent = await fs.readFile(
        path.join(this.repoPath, file.path),
        'utf-8'
      );

      // Apply changes
      const newContent = this.applyDiff(currentContent, file.changes);

      // Write back
      await fs.writeFile(
        path.join(this.repoPath, file.path),
        newContent
      );

      // Stage file
      await this.gitClient.add(file.path);
    }
  }

  async createPullRequest(prData: PRData): Promise<PRResult> {
    // Commit changes
    await this.gitClient.commit(prData.commit_message);

    // Push branch
    await this.gitClient.push('origin', prData.branch_name);

    // Create PR via API (GitHub/GitLab)
    const pr = await this.prAPI.create({
      title: prData.title,
      body: prData.body,
      base: 'main',
      head: prData.branch_name,
      labels: prData.labels
    });

    return {
      url: pr.url,
      number: pr.number,
      branch: prData.branch_name
    };
  }
}
```

### 3. PR Generator Service

```typescript
export class PRGenerator {
  private llmService: LLMService;
  private repoManager: RepositoryManager;

  async generatePR(batch: DocBatch): Promise<void> {
    // Validate repository state
    const validation = await this.repoManager.validateState();

    if (!validation.isValid) {
      if (validation.hasPendingPR) {
        throw new Error('Cannot create PR: pending PR exists');
      }

      if (validation.needsRebase) {
        // Re-run validation against new base
        await this.revalidateBatch(batch);
        return;
      }
    }

    // Generate PR content using LLM
    const prContent = await this.synthesizePR(batch);

    // Create branch
    await this.repoManager.createBranch(prContent.branch_name);

    // Apply changes
    await this.repoManager.applyChanges(prContent.files);

    // Create PR
    const pr = await this.repoManager.createPullRequest(prContent.pull_request);

    // Update batch record
    await this.updateBatchWithPR(batch.id, pr);

    // Send notifications
    await this.notifyAdmins(pr);
  }

  private async synthesizePR(batch: DocBatch): Promise<PRContent> {
    const prompt = this.buildPRSynthesisPrompt(batch);
    const response = await this.llmService.generate(prompt, 'large');
    return JSON.parse(response);
  }

  private async revalidateBatch(batch: DocBatch): Promise<void> {
    // Mark batch as stale
    await this.markBatchStale(batch.id);

    // Re-run update and review passes for affected messages
    const proposals = await this.getBatchProposals(batch.id);

    for (const proposal of proposals) {
      await this.messageProcessor.reprocessMessage(proposal.message_id);
    }
  }
}
```

### 4. PR Status Monitor

```typescript
export class PRStatusMonitor {
  async checkPRStatus(pr: PullRequest): Promise<void> {
    const status = await this.prAPI.getStatus(pr.number);

    switch (status.state) {
      case 'merged':
        await this.handleMerged(pr, status);
        break;

      case 'closed':
        await this.handleClosed(pr, status);
        break;

      case 'open':
        // Check for requested changes
        if (status.reviews.some(r => r.state === 'changes_requested')) {
          await this.handleChangesRequested(pr, status);
        }
        break;
    }
  }

  private async handleMerged(pr: PullRequest, status: PRStatus): Promise<void> {
    // Update batch record
    await this.updateBatch(pr.batch_id, {
      status: 'merged',
      merged_commit_hash: status.merge_commit_sha,
      merged_at: new Date()
    });

    // Mark all related proposals as merged
    await this.markProposalsMerged(pr.batch_id);

    // Clean up branch
    await this.repoManager.deleteBranch(pr.branch_name);
  }

  private async handleClosed(pr: PullRequest, status: PRStatus): Promise<void> {
    // Mark batch as failed
    await this.updateBatch(pr.batch_id, {
      status: 'failed',
      failure_reason: 'PR closed without merging'
    });

    // Flag proposals for re-analysis
    await this.flagProposalsForReanalysis(pr.batch_id);
  }
}
```

## Monitoring & Constraints

### Locking Mechanism
- No sync operations while PR is pending
- No new batch creation if unmerged PR exists
- Atomic batch processing (all or nothing)

### Health Metrics
- PR creation success rate
- Average time to merge
- Rejection rate and reasons
- Stale batch count

### Alerts
- PR creation failure
- Merge conflicts detected
- PR rejected by reviewers
- Repository state validation failure

## Configuration

```bash
# GitHub/GitLab Configuration
GIT_PROVIDER=github  # github|gitlab
GIT_API_TOKEN=xxx
GIT_REPO_OWNER=organization
GIT_REPO_NAME=documentation
GIT_BASE_BRANCH=main

# PR Configuration
PR_REVIEWERS=team-lead,doc-team
PR_LABELS=documentation,automated
PR_DRAFT=false

# Batch Configuration
BATCH_MIN_CHANGES=3  # Minimum changes to create PR
BATCH_MAX_CHANGES=50  # Maximum changes per PR
BATCH_INTERVAL_HOURS=24  # How often to create batches

# Repository Configuration
REPO_LOCAL_PATH=/var/repos/documentation
REPO_CLONE_URL=git@github.com:org/documentation.git
```

## Phase 2 Deliverables

1. Batch aggregation system
2. Conflict detection and resolution
3. Repository state validator
4. PR content generator (LLM-4)
5. Git operations manager
6. PR creation via API
7. PR status monitoring
8. Post-merge cleanup

## Error Handling

### Batch Creation Failures
- Rollback batch creation
- Log detailed error
- Alert administrators
- Preserve approved reviews for next attempt

### Repository Conflicts
- Abort PR creation
- Mark batch as stale
- Trigger re-validation
- Notify admin of manual intervention needed

### PR API Failures
- Retry with exponential backoff
- Store PR content locally
- Allow manual PR creation
- Track failure metrics

### Merge Conflicts
- Detect during validation
- Block PR creation
- Re-run analysis against new base
- Alert if repeated failures

## Testing Strategy

### Unit Tests
- Batch aggregation logic
- Conflict detection
- Diff generation
- PR content synthesis

### Integration Tests
- End-to-end batch to PR flow
- Repository state validation
- PR API interactions
- Status monitoring

### Staging Environment
- Test against real repository fork
- Validate PR quality
- Test merge scenarios
- Monitor performance

## Security Considerations

- Git credentials stored securely
- PR API tokens with minimal permissions
- Branch protection rules respected
- Code review requirements enforced
- Audit trail for all operations

## Future Enhancements

- Multi-repository support
- Custom merge strategies
- Automatic conflict resolution
- PR template customization
- Integration with CI/CD
- Rollback capabilities

## References

- Phase 1 Spec: [/docs/specs/multi-stream-scanner-phase-1.md](/docs/specs/multi-stream-scanner-phase-1.md)
- Story: [Multi-Stream Message Scanner](/docs/stories/multi-stream-message-scanner.md)
- GitHub API: https://docs.github.com/en/rest
- GitLab API: https://docs.gitlab.com/ee/api/merge_requests.html