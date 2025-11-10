# Spec: Admin Changeset Workflow

**Developer:** Wayne
**Created:** 2025-11-04
**Completed:** 2025-11-06
**Status:** ✅ Completed & Archived
**Related Story:** [Multi-Stream Message Scanner](/docs/stories/multi-stream-message-scanner.md)
**Phase:** Phase 1.5 (Bridge between analysis and PR generation)

## Implementation Summary

All requirements have been successfully implemented:
- ✅ Three-tab workflow (Suggested Changes → Discarded → Changeset)
- ✅ Edit proposal modal with save/cancel functionality
- ✅ Approve/Ignore action buttons per proposal
- ✅ Database schema changes (ProposalStatus enum, status field, discardReason)
- ✅ Conversation state management and automatic tab transitions
- ✅ Discard reason tracking (auto-rejected + manual "Admin discarded change")
- ✅ Proposal filtering by status in each tab
- ✅ Collapsible messages/RAG analysis with eye icon toggle
- ✅ Reset functionality to move proposals back to pending

**Files Modified:**
- `/client/src/pages/Admin.tsx` - UI implementation
- `/client/src/components/EditProposalModal.tsx` - Edit modal
- `/client/src/components/ProposalActionButtons.tsx` - Action buttons
- `/prisma/schema.prisma` - Database schema
- `/server/stream/routes/admin-routes.ts` - Backend API
- `/prisma/migrations/20251105095138_initial_schema/` - Database migration

## Overview

Enhance the admin dashboard to support a three-stage workflow for managing documentation suggestions:
1. **Suggested Changes** - Review and triage incoming proposals
2. **Changeset** - Approved changes ready for PR generation
3. **Discarded** - Ignored/rejected proposals

Each proposal can be edited, approved (moved to changeset), or ignored (moved to discarded). Conversations automatically move between tabs based on the status of their proposals.

## Context

Current state:
- System generates documentation proposals per conversation (see `/docs/specs/multi-stream-scanner-phase-1.md`)
- Admin dashboard displays proposals in read-only mode
- No mechanism to build a changeset for PR generation
- No way to edit proposal text before approval
- No workflow state tracking beyond `adminApproved` boolean

Needed for Phase 2 (PR generation):
- Curated changeset of approved proposals
- Ability to modify proposal text before committing
- Clear separation between pending, approved, and rejected proposals
- Conversation-level workflow tracking

## Requirements

### Functional Requirements

#### FR-1: Proposal Action Buttons
- Each proposal displays three action buttons in the top-right corner:
  - **Edit** - Open modal to modify `suggestedText`
  - **Add to Changeset** - Mark as approved and move to changeset
  - **Ignore** - Mark as rejected and move to discarded
- Buttons only visible for proposals in "pending" state
- Actions apply to individual proposals, not entire conversations

#### FR-2: Edit Proposal Text
- Clicking "Edit" opens a modal with:
  - Original suggested text in an editable textarea
  - Save and Cancel buttons
  - Character count indicator
- Saving updates `suggestedText` in the database
- Original text preserved in proposal history (optional enhancement)

#### FR-3: Conversation State Management
- Conversations have three possible states: `pending`, `changeset`, `discarded`
- State automatically determined by proposal statuses:
  - `pending`: At least one proposal is pending (not approved or ignored)
  - `changeset`: All proposals processed AND at least one approved
  - `discarded`: All proposals processed AND none approved (all ignored)
- State recalculated on any proposal status change

#### FR-4: Tab Organization
Three tabs in admin dashboard:
- **Suggested Changes** - Conversations with at least one pending proposal
- **Changeset** - Conversations where all proposals are processed and at least one is approved
- **Discarded** - Conversations where all proposals are processed and all are ignored

#### FR-5: Reverse Actions
- In Changeset and Discarded tabs, show "Remove from [Tab]" button per proposal
- Removing sets proposal status back to `pending`
- Conversation automatically returns to "Suggested Changes" tab

### Database Changes

#### Add `status` to `DocProposal` table
```prisma
enum ProposalStatus {
  pending
  approved
  ignored
}

model DocProposal {
  // ... existing fields
  status         ProposalStatus @default(pending)
  editedText     String?        @db.Text  // Stores edited version if modified
  editedAt       DateTime?
  editedBy       String?
}
```

#### Add computed conversation status
No new table needed - status computed on-the-fly from proposal statuses

### API Endpoints

#### PATCH `/api/admin/stream/proposals/:id`
Update proposal text
```typescript
Request: {
  suggestedText: string
  editedBy: string
}
Response: {
  message: string
  proposal: DocProposal
}
```

#### POST `/api/admin/stream/proposals/:id/status`
Change proposal status (approve/ignore/reset)
```typescript
Request: {
  status: 'approved' | 'ignored' | 'pending'
  reviewedBy: string
}
Response: {
  message: string
  proposal: DocProposal
  conversationStatus?: 'pending' | 'changeset' | 'discarded'
}
```

#### GET `/api/admin/stream/conversations?status=pending|changeset|discarded`
Filter conversations by computed status

### UI Components

#### ProposalActionButtons.tsx
```typescript
interface ProposalActionButtonsProps {
  proposalId: number
  status: ProposalStatus
  onEdit: () => void
  onApprove: () => void
  onIgnore: () => void
  onReset: () => void
}
```

#### EditProposalModal.tsx
```typescript
interface EditProposalModalProps {
  proposal: DocProposal
  isOpen: boolean
  onClose: () => void
  onSave: (text: string) => void
}
```

### Workflow Logic

#### Conversation Status Calculation
```typescript
function getConversationStatus(proposals: DocProposal[]): ConversationStatus {
  const hasPending = proposals.some(p => p.status === 'pending')
  if (hasPending) return 'pending'

  const hasApproved = proposals.some(p => p.status === 'approved')
  if (hasApproved) return 'changeset'

  return 'discarded'
}
```

## User Flows

### Flow 1: Admin Reviews Suggestions
1. Admin opens "Suggested Changes" tab
2. Sees conversations with pending proposals
3. For each proposal:
   - Clicks "Edit" to modify text (optional)
   - Clicks "Add to Changeset" to approve
   - Or clicks "Ignore" to reject
4. Once all proposals in a conversation are processed:
   - Conversation automatically moves to appropriate tab
   - Admin can continue with next conversation

### Flow 2: Admin Builds Changeset
1. Admin processes multiple conversations
2. Approved proposals accumulate in "Changeset" tab
3. Admin can review entire changeset before generating PR
4. If needed, admin can:
   - Remove proposals from changeset (they return to "Suggested Changes")
   - Edit proposal text

### Flow 3: Admin Manages Discarded Items
1. Admin opens "Discarded" tab
2. Reviews ignored proposals
3. If admin changes mind:
   - Clicks "Remove from Discarded"
   - Proposal returns to "Suggested Changes" tab
   - Admin can then approve it

## Implementation Notes

### Frontend Changes
Files to modify:
- `/client/src/pages/Admin.tsx` - Add action buttons, edit modal, status filtering
- `/client/src/components/ProposalCard.tsx` (new) - Extract proposal display logic
- `/client/src/components/EditProposalModal.tsx` (new) - Edit interface
- `/client/src/components/ProposalActionButtons.tsx` (new) - Action buttons

### Backend Changes
Files to modify:
- `/prisma/schema.prisma` - Add `ProposalStatus` enum and fields
- `/server/stream/routes/admin-routes.ts` - Add new endpoints, update conversation query
- `/server/stream/types.ts` - Add type definitions

### Migration Strategy
1. Add new enum and fields to schema
2. Run migration to update database
3. Set all existing proposals to `status = 'pending'`
4. Deploy backend with new endpoints
5. Deploy frontend with new UI

## Testing Requirements

### Unit Tests
- Conversation status calculation logic
- Proposal status transitions
- Edit text validation

### Integration Tests
- PATCH `/api/admin/stream/proposals/:id` - edit text
- POST `/api/admin/stream/proposals/:id/status` - change status
- GET `/api/admin/stream/conversations?status=X` - filtering

### Manual Testing
- Edit proposal text and verify changes persist
- Approve all proposals in a conversation, verify it moves to Changeset
- Ignore all proposals in a conversation, verify it moves to Discarded
- Remove proposal from Changeset, verify conversation returns to Suggested Changes
- Process multiple conversations and verify tab counts update correctly

## Security Considerations

- Only admin users can edit/approve/ignore proposals
- Audit trail: track who edited/approved/ignored each proposal
- Validate edited text length (max 10,000 characters)
- Prevent XSS in edited text (sanitize before display)

## Non-Goals

- Automatic approval based on confidence scores
- Bulk operations (approve all in conversation)
- Comments/discussion threads on proposals
- Email notifications on status changes
- Version history of edited text (future enhancement)

## Future Enhancements

- Bulk actions: "Approve All", "Ignore All" per conversation
- Proposal comments/notes field
- Version history for edited text
- Export changeset as JSON/CSV
- PR preview before generation
- Conflict detection between proposals

## Acceptance Criteria

- [x] Each proposal shows Edit/Add/Ignore buttons in Suggested Changes tab
- [x] Clicking Edit opens modal, allows text editing, saves changes
- [x] Clicking Add moves proposal to Changeset, conversation moves when all processed
- [x] Clicking Ignore moves proposal to Discarded, conversation moves when all processed
- [x] Changeset tab shows only conversations with at least one approved proposal
- [x] Discarded tab shows only conversations with all proposals ignored
- [x] Removing from Changeset/Discarded returns proposal to pending state
- [x] Conversation automatically returns to Suggested Changes when any proposal reset
- [x] Tab counts update in real-time as proposals are processed
- [x] All changes tracked with timestamp and username

## Dependencies

- Existing admin authentication system
- Prisma migration system
- React Query for data fetching
- Radix UI components for modal
- Existing admin dashboard layout

## Timeline

- Database schema changes: 0.5 days
- Backend API endpoints: 1 day
- Frontend components: 2 days
- Integration and testing: 1 day
- **Total: 4.5 days**

## References

- Parent story: `/docs/stories/multi-stream-message-scanner.md`
- Phase 1 implementation: `/docs/specs/multi-stream-scanner-phase-1.md`
- Phase 2 (PR generation): `/docs/specs/multi-stream-scanner-phase-2.md`
- Admin UI: `/client/src/pages/Admin.tsx`
- Admin API: `/server/stream/routes/admin-routes.ts`
- Database schema: `/prisma/schema.prisma`
