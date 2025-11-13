# Spec: PR Generation Workflow (Phase 2)

**Developer:** Wayne
**Created:** 2025-11-06
**Status:** Draft
**Related Story:** [Multi-Stream Message Scanner](/docs/stories/multi-stream-message-scanner.md)
**Prerequisite:** [Admin Changeset Workflow](/docs/archive/specs/admin-changeset-workflow.md)

## Overview

Implement PR generation workflow that takes approved proposals from the Changeset tab, generates a coherent pull request with LLM assistance, creates a draft PR on the target repository (fork), and archives the changeset to an immutable history.

## Key Requirements (From User)

1. **Repository Setup:**
   - Target repository is a FORK of the source documentation repository
   - File paths match 1:1 between source and target
   - PRs are created against the fork

2. **PR Workflow:**
   - Generate ONE PR per changeset batch
   - Show preview modal before submission
   - Create as DRAFT PR initially
   - Admin can edit/finalize before publishing

3. **Changeset Lifecycle:**
   - After PR submission, changeset is CLOSED (immutable)
   - Moved to "Changeset History" tab
   - History shows: proposals, submission date, PR URL
   - No editing or moving back allowed

## Architecture

```
┌────────────────────────────────────┐
│    Changeset Tab (Approved)        │
│  (Active proposals ready for PR)   │
└───────────────┬────────────────────┘
                │
                │ [Generate PR Button]
                ▼
┌────────────────────────────────────┐
│     PR Preview Modal               │
│  - LLM-generated title/body        │
│  - List of changes per file        │
│  - Diff preview                    │
│  - Edit title/body                 │
└───────────────┬────────────────────┘
                │
                │ [Submit PR Button]
                ▼
┌────────────────────────────────────┐
│    GitHub API - Create Draft PR    │
│  - Clone target fork               │
│  - Create feature branch           │
│  - Apply changes                   │
│  - Push branch                     │
│  - Create draft PR                 │
└───────────────┬────────────────────┘
                │
                ▼
┌────────────────────────────────────┐
│   Close Changeset → History        │
│  - Mark batch as submitted         │
│  - Record PR URL                   │
│  - Lock proposals (immutable)      │
│  - Move to Changeset History tab   │
└────────────────────────────────────┘
```

## Database Schema Changes

### New Tables

#### `changeset_batches`
Represents a collection of approved proposals ready for or submitted as a PR.

```prisma
model ChangesetBatch {
  id                Int       @id @default(autoincrement())
  batchId           String    @unique @map("batch_id")
  status            BatchStatus @default(draft)

  // PR Details
  prTitle           String?   @map("pr_title")
  prBody            String?   @db.Text @map("pr_body")
  prUrl             String?   @map("pr_url")
  prNumber          Int?      @map("pr_number")
  branchName        String?   @map("branch_name")

  // Metadata
  totalProposals    Int       @map("total_proposals")
  affectedFiles     Json      @map("affected_files") // Array of file paths

  // Timestamps
  createdAt         DateTime  @default(now()) @map("created_at")
  submittedAt       DateTime? @map("submitted_at")
  submittedBy       String?   @map("submitted_by")

  // Relations
  proposals         BatchProposal[]
  failures          ProposalFailure[]

  @@map("changeset_batches")
}

enum BatchStatus {
  draft       // Being prepared
  submitted   // PR created
  merged      // PR merged
  closed      // PR closed without merge
}

model BatchProposal {
  batchId     Int        @map("batch_id")
  proposalId  Int        @map("proposal_id")

  batch       ChangesetBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  proposal    DocProposal    @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  @@id([batchId, proposalId])
  @@map("batch_proposals")
}
```

Add to `DocProposal`:
```prisma
model DocProposal {
  // ... existing fields
  batchId            Int?           @map("batch_id") // Links to batch when submitted
  prApplicationStatus String?        @map("pr_application_status") // 'applied' | 'failed' | 'skipped'
  prApplicationError  String?        @db.Text @map("pr_application_error") // Reason for failure
  batches            BatchProposal[]
}
```

#### `proposal_failures` (Track orphaned proposals)
```prisma
model ProposalFailure {
  id          Int       @id @default(autoincrement())
  batchId     Int       @map("batch_id")
  proposalId  Int       @map("proposal_id")

  failureType String    @map("failure_type") // 'file_not_found' | 'section_not_found' | 'parse_error'
  errorMessage String   @db.Text @map("error_message")
  filePath    String    @map("file_path")
  attemptedAt DateTime  @default(now()) @map("attempted_at")

  batch       ChangesetBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  proposal    DocProposal    @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  @@index([batchId])
  @@map("proposal_failures")
}
```

## Configuration

Add to `.env`:

```bash
# PR Target Repository (Fork)
PR_TARGET_GIT_URL=git@github.com:YourOrg/conflux-documentation-fork.git
PR_TARGET_REPO_OWNER=YourOrg
PR_TARGET_REPO_NAME=conflux-documentation-fork
PR_TARGET_BRANCH=main

# GitHub API
GITHUB_API_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_PR_REVIEWERS=wayne,team-lead
GITHUB_PR_LABELS=documentation,automated,ai-generated

# Local Repository Path
PR_REPO_LOCAL_PATH=/var/repos/conflux-docs-fork
```

## API Endpoints

### `POST /api/admin/changeset/generate-pr`
Generate PR content from current changeset using LLM.

**Request:**
```typescript
{
  // Empty - uses all approved proposals from changeset
}
```

**Response:**
```typescript
{
  batchId: string,
  prTitle: string,
  prBody: string,
  changes: {
    filePath: string,
    changeCount: number,
    proposals: Array<{
      id: number,
      page: string,
      updateType: string,
      suggestedText: string
    }>
  }[],
  branchName: string
}
```

### `POST /api/admin/changeset/submit-pr`
Create draft PR on GitHub and move changeset to history.

**Request:**
```typescript
{
  batchId: string,
  prTitle: string,
  prBody: string,
  submittedBy: string
}
```

**Response:**
```typescript
{
  success: boolean,
  prUrl: string,
  prNumber: number,
  batchId: string
}
```

### `GET /api/admin/changeset/history`
Get list of submitted changeset batches.

**Response:**
```typescript
{
  batches: Array<{
    batchId: string,
    prTitle: string,
    prUrl: string,
    prNumber: number,
    status: 'submitted' | 'merged' | 'closed',
    totalProposals: number,
    submittedAt: string,
    submittedBy: string,
    proposals: Array<{...}>
  }>
}
```

### `GET /api/admin/changeset/history/:batchId`
Get details of a specific changeset batch.

**Response:**
```typescript
{
  batch: {
    batchId: string,
    prTitle: string,
    prBody: string,
    prUrl: string,
    prNumber: number,
    status: string,
    branchName: string,
    totalProposals: number,
    affectedFiles: string[],
    submittedAt: string,
    submittedBy: string
  },
  proposals: Array<{
    id: number,
    conversationId: string,
    page: string,
    updateType: string,
    section: string,
    suggestedText: string,
    editedText: string,
    reasoning: string
  }>
}
```

## UI Components

### 1. Generate PR Button (Changeset Tab)

Add button to Changeset tab header:

```typescript
<Button
  onClick={handleGeneratePR}
  disabled={changesetProposals.length === 0 || generatePRMutation.isPending}
  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
>
  {generatePRMutation.isPending ? 'Generating...' : 'Generate PR'}
</Button>
```

### 2. PR Preview Modal

```typescript
interface PRPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  prData: {
    batchId: string
    prTitle: string
    prBody: string
    changes: FileChange[]
    branchName: string
  }
  onSubmit: (data: { prTitle: string, prBody: string }) => void
}
```

**Modal Contents:**
- **Editable PR Title** (textarea)
- **Editable PR Body** (large textarea, markdown preview)
- **Changes Summary** (grouped by file)
  - File path
  - Number of proposals
  - Expandable list of proposals
- **Action Buttons:**
  - Cancel (close modal)
  - Submit as Draft PR (calls API)

### 3. Changeset History Tab

New tab in admin dashboard after Changeset tab:

```typescript
<TabsTrigger value="history">
  <span className="font-medium">Changeset History</span>
  <small className="text-[0.65rem] text-gray-500 mt-1">
    {historyCount} submitted
  </small>
</TabsTrigger>
```

**Tab Content:**
- List of submitted batches (cards)
- Each card shows:
  - PR title (link to GitHub)
  - Status badge (draft/merged/closed)
  - Submission date
  - Submitted by
  - Proposal count
  - Expandable to show all proposals

## File Modification Implementation

### FileModificationService

```typescript
export class FileModificationService {
  private repoPath: string;

  /**
   * Apply all proposals for a given file
   */
  async applyProposalsToFile(
    filePath: string,
    proposals: DocProposal[]
  ): Promise<string> {
    // Read current file content
    const fullPath = path.join(this.repoPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Sort proposals by location (apply from bottom to top to avoid offset issues)
    const sorted = this.sortProposalsByLocation(proposals);

    let modifiedLines = [...lines];

    for (const proposal of sorted) {
      modifiedLines = await this.applyProposal(modifiedLines, proposal);
    }

    return modifiedLines.join('\n');
  }

  /**
   * Apply a single proposal to file content
   */
  private async applyProposal(
    lines: string[],
    proposal: DocProposal
  ): Promise<string[]> {
    const text = proposal.editedText || proposal.suggestedText;
    const location = proposal.location as any;

    switch (proposal.updateType) {
      case 'INSERT':
        return this.applyInsert(lines, text, location, proposal.section);

      case 'UPDATE':
        return this.applyUpdate(lines, text, location, proposal.section);

      case 'DELETE':
        return this.applyDelete(lines, location, proposal.section);

      default:
        console.warn(`Unknown updateType: ${proposal.updateType}`);
        return lines;
    }
  }

  /**
   * Insert new content
   */
  private applyInsert(
    lines: string[],
    text: string,
    location: any,
    section: string | null
  ): string[] {
    // Strategy 1: Insert at specific line
    if (location?.lineStart) {
      const insertAt = location.lineStart - 1; // Convert to 0-based
      const newLines = text.split('\n');
      return [
        ...lines.slice(0, insertAt),
        ...newLines,
        ...lines.slice(insertAt)
      ];
    }

    // Strategy 2: Insert under section heading
    if (location?.sectionName || section) {
      const sectionName = location?.sectionName || section;
      const sectionIndex = this.findSectionIndex(lines, sectionName);

      if (sectionIndex !== -1) {
        const insertAt = sectionIndex + 1; // Insert after heading
        const newLines = text.split('\n');
        return [
          ...lines.slice(0, insertAt),
          '',
          ...newLines,
          ...lines.slice(insertAt)
        ];
      }
    }

    // Strategy 3: Append to end of file
    return [...lines, '', ...text.split('\n')];
  }

  /**
   * Update existing content
   */
  private applyUpdate(
    lines: string[],
    text: string,
    location: any,
    section: string | null
  ): string[] {
    // Strategy 1: Replace specific line range
    if (location?.lineStart && location?.lineEnd) {
      const start = location.lineStart - 1; // Convert to 0-based
      const end = location.lineEnd; // Already exclusive
      const newLines = text.split('\n');
      return [
        ...lines.slice(0, start),
        ...newLines,
        ...lines.slice(end)
      ];
    }

    // Strategy 2: Replace entire section
    if (location?.sectionName || section) {
      const sectionName = location?.sectionName || section;
      const { start, end } = this.findSectionRange(lines, sectionName);

      if (start !== -1 && end !== -1) {
        const newLines = text.split('\n');
        return [
          ...lines.slice(0, start + 1), // Keep heading
          ...newLines,
          ...lines.slice(end)
        ];
      }
    }

    console.warn('Could not apply UPDATE: location not found');
    return lines;
  }

  /**
   * Delete content
   */
  private applyDelete(
    lines: string[],
    location: any,
    section: string | null
  ): string[] {
    // Strategy 1: Delete specific line range
    if (location?.lineStart && location?.lineEnd) {
      const start = location.lineStart - 1;
      const end = location.lineEnd;
      return [
        ...lines.slice(0, start),
        ...lines.slice(end)
      ];
    }

    // Strategy 2: Delete entire section
    if (location?.sectionName || section) {
      const sectionName = location?.sectionName || section;
      const { start, end } = this.findSectionRange(lines, sectionName);

      if (start !== -1 && end !== -1) {
        return [
          ...lines.slice(0, start),
          ...lines.slice(end)
        ];
      }
    }

    console.warn('Could not apply DELETE: location not found');
    return lines;
  }

  /**
   * Find line index of a section heading
   */
  private findSectionIndex(lines: string[], sectionName: string): number {
    const normalizedSearch = sectionName.toLowerCase().trim();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match markdown headings: # Heading, ## Heading, etc.
      if (line.startsWith('#')) {
        const heading = line.replace(/^#+\s*/, '').toLowerCase().trim();
        if (heading === normalizedSearch) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Find start and end line indices of a section
   */
  private findSectionRange(
    lines: string[],
    sectionName: string
  ): { start: number; end: number } {
    const startIndex = this.findSectionIndex(lines, sectionName);

    if (startIndex === -1) {
      return { start: -1, end: -1 };
    }

    // Find section level (number of # characters)
    const headingMatch = lines[startIndex].match(/^(#+)/);
    const level = headingMatch ? headingMatch[1].length : 1;

    // Find end of section (next heading at same or higher level)
    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) {
        const nextHeadingMatch = line.match(/^(#+)/);
        const nextLevel = nextHeadingMatch ? nextHeadingMatch[1].length : 1;

        if (nextLevel <= level) {
          endIndex = i;
          break;
        }
      }
    }

    return { start: startIndex, end: endIndex };
  }

  /**
   * Sort proposals to apply from bottom to top (avoids offset issues)
   */
  private sortProposalsByLocation(proposals: DocProposal[]): DocProposal[] {
    return proposals.sort((a, b) => {
      const aLoc = (a.location as any)?.lineStart || Infinity;
      const bLoc = (b.location as any)?.lineStart || Infinity;
      return bLoc - aLoc; // Descending order
    });
  }
}
```

## Implementation Steps

### Phase 1: Database & Backend (2 days)

1. **Database Migration**
   - Create `changeset_batches` table
   - Create `batch_proposals` junction table
   - Add `batchId` to `doc_proposals`

2. **Backend Services**
   - `ChangesetBatchService` - Create and manage batches
   - `PRGeneratorService` - LLM-based PR content generation
   - `GitHubPRService` - GitHub API integration
   - `RepositoryManager` - Git operations on target fork

3. **API Routes**
   - `POST /api/admin/changeset/generate-pr`
   - `POST /api/admin/changeset/submit-pr`
   - `GET /api/admin/changeset/history`
   - `GET /api/admin/changeset/history/:batchId`

### Phase 2: Frontend (2 days)

1. **Generate PR Button**
   - Add to Changeset tab header
   - Wire to `generatePR` mutation

2. **PR Preview Modal Component**
   - Create `PRPreviewModal.tsx`
   - Editable title/body fields
   - Changes summary list
   - Submit handler

3. **Changeset History Tab**
   - Add new tab to Admin.tsx
   - Fetch and display history
   - Expandable batch details
   - Link to GitHub PRs

### Phase 3: File Modification & Git Operations (3 days)

1. **Repository Setup**
   - Clone target fork locally on server
   - Keep in sync with upstream main
   - Fetch latest changes before each PR generation

2. **File Modification Service**
   - Read current file content from repository
   - Parse markdown structure (headings, sections)
   - Apply proposal changes based on:
     - `updateType`: INSERT, UPDATE, DELETE, NONE
     - `location`: { lineStart, lineEnd, sectionName }
     - `section`: heading name to target
     - `suggestedText` or `editedText`: new content
   - Handle multiple proposals per file
   - Validate changes apply cleanly

3. **Change Application Strategies**

   **For INSERT:**
   - If `location.sectionName`: Insert under that heading
   - If `location.lineStart`: Insert at specific line
   - Else: Append to end of section

   **For UPDATE:**
   - If `location.lineStart` and `location.lineEnd`: Replace line range
   - If `section`: Replace entire section content
   - Use fuzzy matching if exact location not found

   **For DELETE:**
   - If `location`: Delete specified range
   - If `section`: Remove entire section

4. **PR Creation Flow**
   - Sync fork with upstream main
   - Create feature branch (e.g., `auto-docs-2025-11-06`)
   - Apply changes to each file:
     - Read file content
     - Apply all proposals for that file
     - Write modified content
     - Stage file (`git add`)
   - Commit with generated message
   - Push branch to fork
   - Create draft PR via GitHub API

5. **Orphaned Proposal Handling**

   When proposals can't be applied, they are tracked separately:

   **Failure Types:**
   - `file_not_found`: File doesn't exist in repository
   - `section_not_found`: Section heading not found in file
   - `parse_error`: Malformed location data or content
   - `conflict`: Overlapping changes that can't be merged

   **Handling Strategy:**

   a. **During PR Generation:**
   ```typescript
   const results = {
     applied: [],
     failed: []
   };

   for (const proposal of proposals) {
     try {
       await applyProposal(proposal);
       results.applied.push(proposal);
     } catch (error) {
       results.failed.push({
         proposal,
         error: error.message,
         type: classifyError(error)
       });
     }
   }

   // Log failures
   for (const failure of results.failed) {
     await prisma.proposalFailure.create({
       data: {
         batchId: batch.id,
         proposalId: failure.proposal.id,
         failureType: failure.type,
         errorMessage: failure.error,
         filePath: failure.proposal.page
       }
     });

     // Update proposal status
     await prisma.docProposal.update({
       where: { id: failure.proposal.id },
       data: {
         prApplicationStatus: 'failed',
         prApplicationError: failure.error
       }
     });
   }
   ```

   b. **UI Display:**
   - PR Preview Modal shows warnings:
     - "⚠️ 3 proposals could not be applied and will be skipped"
     - Expandable list of failed proposals with reasons
   - Admin can choose to:
     - Continue with successful proposals only
     - Cancel and fix issues manually
     - Remove failed proposals from changeset

   c. **After PR Submission:**
   - Failed proposals remain in Changeset tab with status "Failed to Apply"
   - Can be retried in a future PR
   - Can be manually handled
   - Can be discarded

   d. **Changeset History:**
   - Shows both successful and failed proposals
   - Failed proposals marked with ❌ icon
   - Hover shows failure reason
   - Summary: "15 applied, 3 failed"

   **Example UI Flow:**

   ```
   ┌─────────────────────────────────────────────┐
   │  PR Preview                                 │
   ├─────────────────────────────────────────────┤
   │  Title: Update validator documentation     │
   │  Body: [editable textarea]                  │
   │                                             │
   │  ⚠️ Warning: 3 proposals could not be      │
   │     applied (expand to see details)        │
   │                                             │
   │  Changes to Apply (15 proposals):           │
   │    ✅ docs/validators/setup.md (5)         │
   │    ✅ docs/validators/staking.md (4)       │
   │    ✅ docs/api/overview.md (6)             │
   │                                             │
   │  Failed to Apply (3 proposals):             │
   │    ❌ docs/old-page.md (1)                 │
   │       → File not found in repository        │
   │    ❌ docs/api/endpoints.md (2)            │
   │       → Section "Rate Limits" not found     │
   │                                             │
   │  [Cancel]  [Submit PR Anyway]              │
   └─────────────────────────────────────────────┘
   ```

   After submission, in Changeset History:

   ```
   ┌─────────────────────────────────────────────┐
   │  Changeset Batch: batch-2025-11-06         │
   │  PR #123: Update validator documentation    │
   │  Status: Draft PR Created ✅                │
   │  Submitted: 2025-11-06 10:30 AM by Wayne   │
   │                                             │
   │  Results: 15 applied ✅  3 failed ❌       │
   │                                             │
   │  Applied Proposals (15):                    │
   │    ✅ Update staking requirements          │
   │    ✅ Add troubleshooting section          │
   │    ... (13 more)                            │
   │                                             │
   │  Failed Proposals (3):                      │
   │    ❌ Add new API endpoint docs            │
   │       File: docs/old-page.md                │
   │       Error: File not found in repository   │
   │       [Retry] [Edit] [Discard]             │
   │                                             │
   │    ❌ Update rate limit examples (2)       │
   │       File: docs/api/endpoints.md           │
   │       Error: Section "Rate Limits" not found│
   │       [Retry] [Edit] [Discard]             │
   └─────────────────────────────────────────────┘
   ```

6. **Error Handling**
   - **File not found:** Mark as failed, continue with other files
   - **Section not found:** Try fuzzy match, if fails mark as failed
   - **Merge conflicts:** Detect and report to admin, abort PR
   - **Git conflicts:** Abort and retry after sync
   - **API failures:** Retry with exponential backoff
   - **Rollback:** Delete branch if PR creation fails, mark batch as failed

### Phase 4: Testing & Polish (0.5 days)

1. **Integration Tests**
   - PR generation flow
   - GitHub API mocking
   - Database transactions

2. **Manual Testing**
   - Generate PR with real proposals
   - Verify draft PR creation
   - Check history display
   - Test error scenarios

## LLM Prompt for PR Generation

```typescript
const prGenerationPrompt = `
You are generating a pull request for documentation updates based on community conversations.

**Project Context:**
- Project: ${config.projectName}
- Documentation: ${config.docPurpose}
- Style Guide: ${config.styleGuide}

**Approved Changes:**
${JSON.stringify(approvedProposals, null, 2)}

**Task:**
Generate a professional pull request that:
1. Has a clear, concise title (max 72 chars)
2. Explains what was changed and why
3. Groups related changes logically
4. Mentions affected documentation pages
5. Acknowledges community input

**Output Format (JSON):**
{
  "title": "Update validator documentation based on community feedback",
  "body": "## Summary\\n\\nThis PR updates documentation based on 15 community conversations analyzing common questions and issues.\\n\\n## Changes\\n\\n### Node Setup Documentation\\n- Clarified minimum staking requirements\\n- Added troubleshooting section for common errors\\n\\n### API Reference\\n- Updated rate limiting examples\\n- Fixed outdated endpoint URLs\\n\\n## Source\\n\\nThese updates were identified through automated analysis of community discussions on Telegram and support channels.\\n\\n---\\n*This PR was generated automatically by NearDocsAI*",
  "commitMessage": "docs: update validator and API documentation from community feedback\\n\\nBased on analysis of 15 community conversations, this commit updates:\\n- Validator staking requirements\\n- Node troubleshooting guides\\n- API rate limiting examples"
}

**Style Guidelines:**
- Use active voice
- Be specific about what changed
- Keep title under 72 characters
- Use markdown formatting in body
- Group changes by topic/file
`;
```

## Error Handling

### Scenario 1: Git Conflicts
**Cause:** Target branch has changes since last sync
**Solution:**
- Detect conflicts before PR creation
- Sync fork with upstream
- Retry PR generation
- Alert admin if conflicts persist

### Scenario 2: GitHub API Failure
**Cause:** Rate limit, network error, invalid token
**Solution:**
- Retry with exponential backoff
- Store PR content in database
- Allow manual PR creation via exported data
- Alert admin with error details

### Scenario 3: Invalid Proposals
**Cause:** File doesn't exist, path mismatch
**Solution:**
- Validate all file paths before PR generation
- Skip invalid proposals with warning
- Continue with valid proposals
- Log validation errors

## Security Considerations

- **GitHub Token:** Store securely, use minimal permissions (repo scope only)
- **Git Credentials:** Use SSH keys, not passwords
- **Branch Protection:** Respect branch protection rules on target
- **Audit Trail:** Log all PR creation attempts with user info
- **Draft PRs:** Created as drafts to prevent accidental merges

## Success Metrics

- PR generation success rate > 95%
- Average time to generate PR < 30 seconds
- Draft PR quality (manual review score)
- Merge rate of generated PRs
- Time from changeset to merged PR

## Future Enhancements

- **Auto-merge:** Automatically merge PRs after passing CI
- **Conflict Resolution:** LLM-assisted conflict resolution
- **Multi-batch PRs:** Support creating multiple PRs per changeset
- **PR Templates:** Customizable PR body templates
- **Status Monitoring:** Track PR review status and auto-update history

## Acceptance Criteria

- [ ] "Generate PR" button appears in Changeset tab
- [ ] Clicking button generates PR content using LLM
- [ ] PR preview modal shows title, body, and changes
- [ ] Admin can edit title and body before submission
- [ ] "Submit PR" creates draft PR on GitHub
- [ ] PR URL is recorded in database
- [ ] Changeset is closed and moved to History
- [ ] Changeset History tab shows all submitted batches
- [ ] History entries are immutable (no edit/move back)
- [ ] Each history entry links to GitHub PR
- [ ] Error handling for all failure scenarios

## Dependencies

- GitHub API access (token with repo permissions)
- Target repository fork setup
- simple-git npm package
- Existing changeset workflow (Phase 1.5)
- LLM service for PR content generation

## Timeline

- Database & Backend: 2 days
- Frontend Components: 2 days
- **File Modification Service: 3 days** (critical component)
  - Implement file reading/parsing
  - Apply INSERT/UPDATE/DELETE operations
  - Section detection and fuzzy matching
  - Handle edge cases and validation
- Git Operations & PR Creation: 1 day
- Testing & Polish: 1 day
- **Total: 9 days**

## References

- GitHub REST API: https://docs.github.com/en/rest
- simple-git: https://github.com/steveukx/git-js
- Phase 2 Spec: [multi-stream-scanner-phase-2.md](/docs/specs/multi-stream-scanner-phase-2.md)
- Changeset Workflow: [admin-changeset-workflow.md](/docs/archive/specs/admin-changeset-workflow.md)
