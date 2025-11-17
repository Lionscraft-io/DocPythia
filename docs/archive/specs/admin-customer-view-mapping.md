# Admin Customer View Mapping - Technical Specification

**Spec ID:** admin-customer-view-mapping
**Created by:** Wayne
**Date:** 2025-11-12
**Status:** Draft
**Related Story:** N/A (Internal refactoring initiative)
**Related PRD:** N/A

## 1. Overview

This specification defines the implementation plan for refactoring the admin portal to support two distinct views:
- **Customer View** (simple): All documentation change proposals with conversation context and PR generation - intended for end customers
- **Advanced View** (complex): Full multi-stream processing system with RAG, LLM cache, and unprocessed messages - intended for internal testing and debugging

**Current State:**
- `/admin` - Complex implementation (1,922 lines) with full stream processing visibility
- `/admin/legacy` - Simple implementation (307 lines) using old `/api/updates` endpoint

**Target State:**
- `/admin` - Simple customer-facing view showing all proposals, conversation context, and PR generation
- `/admin/advanced` - Current complex view for internal use with RAG/LLM/cache visibility

**Technical Goals:**
- Preserve all existing functionality in the advanced view
- Create a clean customer experience that shows proposals and conversation context but hides RAG, LLM cache, and processing details
- Enable customers to view proposals, approve/reject them, view conversation context, generate PRs, and view PR history
- Reuse existing backend APIs without major changes
- Support seamless switching between views for admins

## 2. Technical Approach

### Architecture Pattern
Use a **facade pattern** to abstract the complex multi-stream system into a simplified customer-facing interface. The customer view will consume the same backend APIs but hide RAG retrieval docs, LLM cache stats, and unprocessed messages. Customers will see all proposals with conversation context and can generate PRs.

### Key Design Decisions

1. **Backend Changes**: Minimal - Reuse existing conversation/proposal APIs, hide RAG/LLM endpoints from customer view
2. **Frontend Changes**: Major - Simplify current Admin.tsx by removing RAG, LLM cache, and unprocessed messages tabs
3. **Data Flow**: Customer view shows ALL `DocProposal` records grouped by conversation, with conversation context visible
4. **PR Generation**: Customers can trigger PR creation using existing PR preview modal
5. **Migration Strategy**: Rename current Admin.tsx to AdminAdvanced.tsx, create simplified Admin.tsx from current implementation

### Alternative Approaches Considered

**Option A: Create entirely new backend endpoints** - Rejected because it duplicates logic and increases maintenance
**Option B: Use GraphQL to allow flexible querying** - Rejected as too complex for this use case
**Option C: Keep legacy endpoints for customer view** - Rejected because old system is deprecated

### Patterns to Follow
- Use existing TanStack Query patterns for data fetching
- Maintain consistent auth middleware (adminAuth)
- Follow existing UI component structure (UpdateCard, StatsCard)
- Use Wouter for routing

## 3. Data Model Changes

### Schema Changes
**No database schema changes required.** The customer view will use existing tables:
- `PendingUpdate` (legacy system - being phased out)
- `DocProposal` (current system)
- `ChangesetBatch` (PR generation)
- `MessageClassification` (for statistics)
- `ConversationRagContext` (for RAG context)

### Data Flow

**Current Complex View (/admin):**
```
UnifiedMessage → MessageClassification → ConversationRagContext → DocProposal → ChangesetBatch → PR
     (raw)           (categorized)         (RAG enriched)        (changes)      (batched)    (GitHub)
```

**Customer View (/admin) - Simplified:**
```
UnifiedMessage → MessageClassification → DocProposal (with conversation context) → ChangesetBatch → PR
   (hidden)            (hidden)              (visible - all proposals)        (visible)     (visible)
```

**What Customers See:**
- ALL documentation change proposals (pending, approved, ignored)
- Conversation context for each proposal (messages that led to the suggestion)
- Ability to approve/reject/edit proposals
- PR generation and PR history
- Stats and pagination

**What Customers Don't See:**
- RAG retrieval documents
- LLM cache stats
- Unprocessed messages queue
- Raw message classification details

**Data Transformation (Optional):**

If backwards compatibility with PendingUpdate format is needed, transform each `DocProposal` to match `PendingUpdate` interface:
```typescript
{
  id: proposal.id.toString(),
  sectionId: proposal.page,  // Map page to sectionId
  type: mapUpdateType(proposal.updateType), // INSERT→add, UPDATE→major, DELETE→delete
  summary: proposal.reasoning || "Documentation update",
  source: `Conversation ${proposal.conversationId}`,
  status: "pending", // All approved proposals are pending customer review
  diffBefore: extractBeforeContent(proposal), // Extract from location
  diffAfter: proposal.editedText || proposal.suggestedText,
  createdAt: proposal.createdAt,
  reviewedAt: proposal.adminReviewedAt,
  reviewedBy: proposal.adminReviewedBy
}
```

### Validation Rules
- Customer view only shows proposals that have been admin-approved
- Proposals already in a submitted batch (`prBatchId != null` and batch status is 'submitted') are hidden
- Auto-applied proposals (if any) use status "auto-applied"

## 4. API/Interface Design

### New Backend Endpoints

#### GET /api/customer/updates
Returns approved proposals formatted as PendingUpdate objects for customer review.

**Request:**
```typescript
GET /api/customer/updates?status=pending|approved|auto-applied|all
```

**Response:**
```typescript
{
  updates: PendingUpdate[],
  stats: {
    total: number,
    pending: number,
    approved: number,
    autoApplied: number
  }
}
```

**Authentication:** Requires admin token
**Implementation Location:** `/root/src/lionscraft-NearDocsAI/server/routes.ts`

#### POST /api/customer/updates/:id/approve
Marks a proposal as customer-approved and adds it to the changeset for PR generation.

**Request:**
```typescript
POST /api/customer/updates/:id/approve
{
  reviewedBy?: string
}
```

**Response:**
```typescript
{
  success: true,
  proposalId: number,
  status: "changeset"
}
```

**Implementation:** Updates `DocProposal.status = 'approved'` and marks for inclusion in next batch

#### POST /api/customer/updates/:id/reject
Marks a proposal as ignored by customer.

**Request:**
```typescript
POST /api/customer/updates/:id/reject
{
  reviewedBy?: string,
  reason?: string
}
```

**Response:**
```typescript
{
  success: true,
  proposalId: number,
  status: "ignored"
}
```

**Implementation:** Updates `DocProposal.status = 'ignored'`

#### PATCH /api/customer/updates/:id
Allows customer to edit the suggested text before approval.

**Request:**
```typescript
PATCH /api/customer/updates/:id
{
  summary?: string,
  diffAfter?: string
}
```

**Response:**
```typescript
{
  success: true,
  proposal: DocProposal
}
```

**Implementation:** Updates `DocProposal.editedText`, `editedBy`, `editedAt`

### Frontend Component Structure

**Customer View Components:**
- `Admin.tsx` (refactored legacy) - Main customer view
- `UpdateCard.tsx` (existing) - Display individual updates
- `StatsCard.tsx` (existing) - Dashboard statistics
- `Header.tsx` (existing) - Navigation

**Advanced View Components:**
- `AdminAdvanced.tsx` (renamed from current Admin.tsx) - Full stream processing view
- All existing complex components remain

## 5. Implementation Details

### Backend

#### New Service: Customer Update Transformer
**File:** `/root/src/lionscraft-NearDocsAI/server/services/customer-update-transformer.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import type { PendingUpdate } from '@shared/schema';

export class CustomerUpdateTransformer {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get all approved proposals formatted as PendingUpdate objects
   */
  async getCustomerUpdates(status?: string): Promise<PendingUpdate[]> {
    const whereClause = this.buildWhereClause(status);

    const proposals = await this.prisma.docProposal.findMany({
      where: whereClause,
      include: {
        prBatch: true // To check if already in submitted batch
      },
      orderBy: { createdAt: 'desc' }
    });

    return proposals.map(p => this.transformProposal(p));
  }

  /**
   * Get statistics for customer dashboard
   */
  async getStats() {
    const total = await this.prisma.docProposal.count({
      where: { adminApproved: true }
    });

    const pending = await this.prisma.docProposal.count({
      where: {
        adminApproved: true,
        status: 'pending',
        prBatchId: null
      }
    });

    const approved = await this.prisma.docProposal.count({
      where: {
        adminApproved: true,
        status: 'approved'
      }
    });

    // Note: auto-applied doesn't exist in current system
    const autoApplied = 0;

    return { total, pending, approved, autoApplied };
  }

  private buildWhereClause(status?: string) {
    const base = {
      adminApproved: true,
      prBatch: {
        isNot: {
          status: 'submitted' // Hide proposals already in submitted PRs
        }
      }
    };

    if (status === 'pending') {
      return { ...base, status: 'pending' };
    } else if (status === 'approved') {
      return { ...base, status: 'approved' };
    }
    // 'all' or undefined returns all
    return base;
  }

  private transformProposal(proposal: any): PendingUpdate {
    return {
      id: proposal.id.toString(),
      sectionId: proposal.page,
      type: this.mapUpdateType(proposal.updateType),
      summary: proposal.reasoning || "Documentation update",
      source: `Conversation ${proposal.conversationId}`,
      status: this.mapStatus(proposal.status),
      diffBefore: null, // Could extract from file if needed
      diffAfter: proposal.editedText || proposal.suggestedText,
      createdAt: proposal.createdAt,
      reviewedAt: proposal.adminReviewedAt,
      reviewedBy: proposal.adminReviewedBy
    };
  }

  private mapUpdateType(updateType: string): "minor" | "major" | "add" | "delete" {
    const mapping: Record<string, "minor" | "major" | "add" | "delete"> = {
      'INSERT': 'add',
      'UPDATE': 'major',
      'DELETE': 'delete',
      'NONE': 'minor'
    };
    return mapping[updateType] || 'major';
  }

  private mapStatus(status: string): "pending" | "approved" | "rejected" | "auto-applied" {
    const mapping: Record<string, "pending" | "approved" | "rejected" | "auto-applied"> = {
      'pending': 'pending',
      'approved': 'approved',
      'ignored': 'rejected'
    };
    return mapping[status] || 'pending';
  }
}
```

#### New Routes in routes.ts
**File:** `/root/src/lionscraft-NearDocsAI/server/routes.ts`

Add after existing `/api/updates` routes (around line 900):

```typescript
// Customer-facing update routes (simplified view of approved proposals)
app.get("/api/customer/updates", adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const transformer = new CustomerUpdateTransformer(prisma);

    const updates = await transformer.getCustomerUpdates(status as string);
    const stats = await transformer.getStats();

    res.json({ updates, stats });
  } catch (error) {
    console.error("Error fetching customer updates:", error);
    res.status(500).json({ error: "Failed to fetch updates" });
  }
});

app.post("/api/customer/updates/:id/approve", adminAuth, async (req, res) => {
  try {
    const proposalId = parseInt(req.params.id);
    const { reviewedBy } = req.body;

    const proposal = await prisma.docProposal.update({
      where: { id: proposalId },
      data: {
        status: 'approved',
        adminReviewedAt: new Date(),
        adminReviewedBy: reviewedBy || 'customer'
      }
    });

    res.json({ success: true, proposalId, status: 'changeset' });
  } catch (error) {
    console.error("Error approving customer update:", error);
    res.status(500).json({ error: "Failed to approve update" });
  }
});

app.post("/api/customer/updates/:id/reject", adminAuth, async (req, res) => {
  try {
    const proposalId = parseInt(req.params.id);
    const { reviewedBy, reason } = req.body;

    const proposal = await prisma.docProposal.update({
      where: { id: proposalId },
      data: {
        status: 'ignored',
        discardReason: reason,
        adminReviewedAt: new Date(),
        adminReviewedBy: reviewedBy || 'customer'
      }
    });

    res.json({ success: true, proposalId, status: 'ignored' });
  } catch (error) {
    console.error("Error rejecting customer update:", error);
    res.status(500).json({ error: "Failed to reject update" });
  }
});

app.patch("/api/customer/updates/:id", adminAuth, async (req, res) => {
  try {
    const proposalId = parseInt(req.params.id);
    const { summary, diffAfter } = req.body;

    const updateData: any = {
      editedAt: new Date(),
      editedBy: 'customer'
    };

    if (diffAfter) {
      updateData.editedText = diffAfter;
    }

    if (summary) {
      updateData.reasoning = summary;
    }

    const proposal = await prisma.docProposal.update({
      where: { id: proposalId },
      data: updateData
    });

    res.json({ success: true, proposal });
  } catch (error) {
    console.error("Error editing customer update:", error);
    res.status(500).json({ error: "Failed to edit update" });
  }
});
```

### Frontend

#### Refactor AdminLegacy.tsx → Admin.tsx (Customer View)
**File:** `/root/src/lionscraft-NearDocsAI/client/src/pages/Admin.tsx` (will replace current)

Key changes:
1. Update API endpoint from `/api/updates` to `/api/customer/updates`
2. Remove "(Legacy View)" from title
3. Add view switcher to toggle between customer and advanced views
4. Use new response format with `stats` object

```typescript
// Updated query
const { data: response, isLoading, error } = useQuery<{ updates: PendingUpdate[], stats: any }>({
  queryKey: ["/api/customer/updates"],
  queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
});

const updates = response?.updates || [];
const stats = response?.stats || { total: 0, pending: 0, approved: 0, autoApplied: 0 };

// Updated stats cards
<StatsCard
  title="Total Updates"
  value={stats.total}
  icon={FileText}
  description="All time"
/>
<StatsCard
  title="Pending Review"
  value={stats.pending}
  icon={Clock}
  description="Awaiting approval"
/>
<StatsCard
  title="Approved"
  value={stats.approved}
  icon={CheckCircle2}
  description="Ready for PR"
/>
<StatsCard
  title="Auto-Applied"
  value={stats.autoApplied}
  icon={CheckCircle2}
  description="Minor changes"
/>
```

#### Rename Current Admin.tsx → AdminAdvanced.tsx
**File:** `/root/src/lionscraft-NearDocsAI/client/src/pages/AdminAdvanced.tsx` (renamed from Admin.tsx)

Changes:
1. Export as `AdminAdvanced` instead of `Admin`
2. Update title to "Admin Dashboard - Advanced View"
3. Add link to customer view

#### Update Router
**File:** `/root/src/lionscraft-NearDocsAI/client/src/App.tsx` or routing config

```typescript
<Route path="/admin" component={Admin} />
<Route path="/admin/advanced" component={AdminAdvanced} />
<Route path="/admin/legacy" component={AdminLegacy} /> // Keep for backwards compat temporarily
```

#### Add View Switcher Component
**File:** `/root/src/lionscraft-NearDocsAI/client/src/components/ViewSwitcher.tsx`

```typescript
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Settings, Eye } from "lucide-react";

export function ViewSwitcher() {
  const [location, setLocation] = useLocation();
  const isAdvanced = location === "/admin/advanced";

  return (
    <div className="flex gap-2">
      <Button
        variant={isAdvanced ? "outline" : "default"}
        size="sm"
        onClick={() => setLocation("/admin")}
      >
        <Eye className="w-4 h-4 mr-2" />
        Customer View
      </Button>
      <Button
        variant={isAdvanced ? "default" : "outline"}
        size="sm"
        onClick={() => setLocation("/admin/advanced")}
      >
        <Settings className="w-4 h-4 mr-2" />
        Advanced View
      </Button>
    </div>
  );
}
```

### File Changes Summary

**New Files:**
- `/root/src/lionscraft-NearDocsAI/server/services/customer-update-transformer.ts` - Transform proposals to updates
- `/root/src/lionscraft-NearDocsAI/client/src/components/ViewSwitcher.tsx` - Toggle between views

**Modified Files:**
- `/root/src/lionscraft-NearDocsAI/server/routes.ts` - Add customer update endpoints
- `/root/src/lionscraft-NearDocsAI/client/src/pages/Admin.tsx` - Refactored from AdminLegacy, use new endpoints
- `/root/src/lionscraft-NearDocsAI/client/src/pages/AdminAdvanced.tsx` - Renamed from Admin.tsx
- `/root/src/lionscraft-NearDocsAI/client/src/App.tsx` - Update routes

**Deleted Files:**
- `/root/src/lionscraft-NearDocsAI/client/src/pages/AdminLegacy.tsx` - After migration complete

## 6. Dependencies

### External Libraries
- No new dependencies required
- Uses existing:
  - `@prisma/client` ^5.x - Database ORM
  - `@tanstack/react-query` ^5.x - Data fetching
  - `wouter` ^3.x - Routing
  - `zod` ^3.x - Validation

### Internal Services
- `PrismaClient` - Database access
- `adminAuth` middleware - Authentication
- Existing UI components: `UpdateCard`, `StatsCard`, `Header`

### Infrastructure
- PostgreSQL 15+ (existing)
- No additional infrastructure needed

## 7. Testing Requirements

### Unit Tests

**Backend Tests:**
`/root/src/lionscraft-NearDocsAI/tests/services/customer-update-transformer.test.ts`

```typescript
describe('CustomerUpdateTransformer', () => {
  it('should transform DocProposal to PendingUpdate format', async () => {
    // Test transformation logic
  });

  it('should filter out proposals in submitted batches', async () => {
    // Test batch filtering
  });

  it('should map update types correctly', () => {
    // INSERT -> add, UPDATE -> major, etc.
  });

  it('should calculate stats correctly', async () => {
    // Test stats aggregation
  });
});
```

**Frontend Tests:**
`/root/src/lionscraft-NearDocsAI/tests/pages/Admin.test.tsx`

```typescript
describe('Admin Customer View', () => {
  it('should render stats cards with correct data', () => {
    // Test stats display
  });

  it('should show pending updates in pending tab', () => {
    // Test tab filtering
  });

  it('should call approve endpoint on approve button click', () => {
    // Test approve action
  });

  it('should switch to advanced view when button clicked', () => {
    // Test view switcher
  });
});
```

### Integration Tests

**API Integration Tests:**
`/root/src/lionscraft-NearDocsAI/tests/integration/customer-updates-api.test.ts`

```typescript
describe('Customer Updates API', () => {
  it('GET /api/customer/updates should return approved proposals', async () => {
    // Test endpoint returns correct data
  });

  it('POST /api/customer/updates/:id/approve should update proposal status', async () => {
    // Test approval flow
  });

  it('should not return proposals already in submitted PRs', async () => {
    // Test filtering logic
  });
});
```

### E2E Tests

**Customer Journey:**
```typescript
describe('Customer Admin Portal', () => {
  it('should allow customer to review and approve updates', () => {
    // 1. Login as admin
    // 2. Navigate to /admin
    // 3. See pending updates
    // 4. Approve an update
    // 5. Verify it moves to approved tab
  });

  it('should allow switching between customer and advanced views', () => {
    // Test view switcher functionality
  });
});
```

### Manual Testing Checklist
- [ ] Customer view shows only admin-approved proposals
- [ ] Stats cards display correct counts
- [ ] Approve action moves proposal to changeset
- [ ] Reject action marks proposal as ignored
- [ ] Edit action updates proposal text
- [ ] View switcher navigates between views
- [ ] Advanced view still shows all complexity
- [ ] Proposals in submitted PRs are hidden from customer view
- [ ] Auth redirects work correctly

## 8. Security Considerations

### Authentication
- All customer update endpoints require `adminAuth` middleware
- Same authentication as existing admin routes
- Session token in `sessionStorage`

### Authorization
- Only admin users can access customer view
- Future enhancement: separate customer role with limited permissions
- Consider adding `RBAC` for customer vs internal admin

### Data Protection
- No PII exposed in proposals
- Customer can only see approved content (already reviewed by admin)
- No access to raw messages or conversation data

### Input Validation
- Use Zod schemas for all API inputs
- Validate proposal IDs are integers
- Sanitize user-edited text before storage

### XSS/CSRF Protection
- All user input displayed in UpdateCard uses React's built-in XSS protection
- CSRF tokens handled by existing Express middleware
- No `dangerouslySetInnerHTML` used

## 9. Performance Considerations

### Expected Load
- Customer view will be accessed infrequently (weekly reviews)
- Typical dataset: 10-100 pending proposals
- Advanced view handles same load as current system

### Caching Strategy
- Use TanStack Query default cache (5 min)
- No additional caching needed for customer view
- Advanced view retains 15-second refetch intervals

### Optimization
- Add database index on `DocProposal.adminApproved` if not exists
- Add composite index on `(adminApproved, status, prBatchId)` for filtering
- Use `SELECT` only needed fields in transformer

**Database Query Optimization:**
```sql
CREATE INDEX IF NOT EXISTS idx_doc_proposals_customer_view
ON doc_proposals(admin_approved, status, pr_batch_id)
WHERE admin_approved = true;
```

### Database Query Performance
- Customer view queries ~10-100 rows (approved proposals)
- Expected query time: <50ms
- No complex joins needed
- Consider pagination if proposal count exceeds 100

## 10. Error Handling

### Error Scenarios

**Backend:**
1. **Proposal Not Found** → 404 with `{ error: "Proposal not found" }`
2. **Database Connection Failure** → 500 with `{ error: "Failed to fetch updates" }`
3. **Invalid Proposal ID** → 400 with `{ error: "Invalid proposal ID" }`
4. **Unauthorized Access** → 401 redirect to `/admin/login`

**Frontend:**
1. **API Request Fails** → Show toast notification with error message
2. **Auth Token Expired** → Clear session and redirect to login
3. **Network Error** → Retry with exponential backoff (TanStack Query default)

### User-Facing Error Messages
- "Failed to load updates. Please refresh the page."
- "Failed to approve update. Please try again."
- "Failed to edit update. Please try again."
- "Session expired. Please log in again."

### Logging Requirements
- Log all customer actions (approve, reject, edit) to console
- Include proposal ID, action type, and timestamp
- Log transformation errors with proposal data
- Use existing error logging infrastructure

### Rollback Procedures
If customer view deployment fails:
1. Revert route changes in `App.tsx`
2. Point `/admin` back to `AdminLegacy.tsx`
3. Keep new API endpoints (backwards compatible)
4. Investigate errors in logs
5. Fix issues and redeploy

## 11. Deployment Notes

### Migration Steps

**Phase 1: Backend Deployment**
1. Deploy new customer update transformer service
2. Deploy new `/api/customer/updates` endpoints
3. Test endpoints with existing data
4. Verify no breaking changes to existing routes

**Phase 2: Frontend Deployment**
1. Rename `Admin.tsx` → `AdminAdvanced.tsx`
2. Refactor `AdminLegacy.tsx` → `Admin.tsx`
3. Update routes in `App.tsx`
4. Deploy view switcher component
5. Test customer view with real data

**Phase 3: Cleanup (1 week after deployment)**
1. Remove `AdminLegacy.tsx` if customer view stable
2. Remove old `/api/updates` endpoint if no longer used
3. Update documentation

### Feature Flags
No feature flags needed. Use route-based deployment:
- Deploy backend first (no breaking changes)
- Deploy frontend incrementally
- Keep legacy route for rollback

### Rollout Strategy
1. **Week 1:** Deploy to staging, test with internal users
2. **Week 2:** Deploy to production, monitor errors
3. **Week 3:** Gather customer feedback, iterate
4. **Week 4:** Remove legacy code if stable

### Rollback Plan
If critical issues occur:
1. Revert `App.tsx` route changes (1 min)
2. Revert `Admin.tsx` to legacy version (5 min)
3. Backend endpoints remain (no rollback needed)
4. Investigate and fix issues offline

## 12. Open Questions

### Answered by Wayne (2025-11-12)
1. **Question:** Should customer view show conversation context?
   **Answer:** ✅ YES - Customers should see conversation context showing why the change was suggested

2. **Question:** Should customers be able to generate PRs?
   **Answer:** ✅ YES - PR generation functionality needs to be available to customers

3. **Question:** Should customers see PR history?
   **Answer:** ✅ YES - Customers should see submitted PRs

4. **Question:** Should we support pagination?
   **Answer:** ✅ YES - Pagination for suggested changes

5. **Question:** Should customers see all proposals or just approved?
   **Answer:** ✅ ALL PROPOSALS - Not just admin-approved, customers should see all suggestions

### Technical Unknowns
1. **Question:** Does PR generation functionality exist for customers, or does it need to be built?
   **Answer Needed From:** Wayne
   **Impact:** Implementation scope
   **Status:** Wayne mentioned "functionality probably doesn't exist" - needs investigation

2. **Question:** Should customer view support bulk approve/reject actions?
   **Answer Needed From:** Wayne
   **Impact:** UX enhancement
   **Status:** Pending

3. **Question:** What specific conversation details should be shown? Full message history or summarized context?
   **Answer Needed From:** Wayne
   **Impact:** UI design
   **Status:** Pending - Reference made to "design done in Replit"

### Decisions Pending
1. **Question:** Do we need separate authentication roles for customers vs admins?
   **Answer Needed From:** Wayne
   **Impact:** Security model
   **Status:** Pending

2. **Question:** Do we keep legacy `/api/updates` endpoint or deprecate it?
   **Answer Needed From:** Wayne
   **Impact:** Backwards compatibility
   **Status:** Recommend deprecation after migration

### Risks Needing Mitigation
1. **Risk:** Customer confusion about proposal statuses (pending vs approved vs ignored)
   **Mitigation:** Clear UI copy and status indicators
   **Status:** Design decision needed

2. **Risk:** Large number of proposals slows down customer view
   **Mitigation:** Pagination (already approved by Wayne)
   **Status:** Implementation required

3. **Risk:** Customers accidentally approve wrong proposals
   **Mitigation:** Add confirmation dialog before approve
   **Status:** Consider for Phase 2

---

## Appendix A: Data Source Mapping

### Advanced View Data Sources

| Tab/Feature | API Endpoint | Database Tables | Data Purpose |
|-------------|--------------|-----------------|--------------|
| Suggested Changes | `/api/admin/stream/conversations?status=pending` | `UnifiedMessage`, `MessageClassification`, `DocProposal`, `ConversationRagContext` | Show conversations with pending proposals |
| Changeset | `/api/admin/stream/conversations?status=changeset` | Same as above | Show conversations with approved proposals |
| Discarded | `/api/admin/stream/conversations?status=discarded` | Same as above | Show conversations with ignored proposals |
| Unprocessed Messages | `/api/admin/stream/messages?processingStatus=PENDING` | `UnifiedMessage` | Show raw unprocessed messages |
| LLM Cache | `/api/admin/llm-cache`, `/api/admin/llm-cache/stats` | External cache (not in DB) | LLM request caching stats |
| PR History | `/api/admin/stream/batches?status=submitted` | `ChangesetBatch`, `BatchProposal` | Show submitted PR batches |
| Stream Stats | `/api/admin/stream/stats` | All stream tables | Overall processing statistics |

### Customer View Data Sources

| Tab/Feature | API Endpoint | Database Tables | Data Purpose |
|-------------|--------------|-----------------|--------------|
| Pending | `/api/customer/updates?status=pending` | `DocProposal` (where adminApproved=true) | Customer-facing pending reviews |
| Approved | `/api/customer/updates?status=approved` | `DocProposal` (where status=approved) | Customer-approved changes |
| Auto-Applied | `/api/customer/updates?status=auto-applied` | `DocProposal` (future feature) | Automatically applied minor changes |
| All | `/api/customer/updates` | `DocProposal` (all admin-approved) | All customer-visible updates |

## Appendix B: Feature Comparison Matrix

| Feature | Customer View (/admin) | Advanced View (/admin/advanced) | Notes |
|---------|------------------------|--------------------------------|-------|
| **Display ALL documentation changes** | ✅ Yes | ✅ Yes | Customer sees all proposals |
| **Approve/Reject changes** | ✅ Yes | ✅ Yes | Same functionality |
| **Edit proposed text** | ✅ Yes | ✅ Yes | Same functionality |
| **View conversation context** | ✅ Yes | ✅ Yes | Customers see messages that led to proposal |
| **View RAG retrieval docs** | ❌ No | ✅ Yes | Hidden from customers - internal detail |
| **View raw messages** | Partial (context only) | ✅ Yes | Customers see related conversation messages |
| **View unprocessed messages** | ❌ No | ✅ Yes | Hidden from customers - internal queue |
| **Generate PRs** | ✅ Yes | ✅ Yes | Customers can trigger PR generation |
| **View PR history** | ✅ Yes | ✅ Yes | Customers can see submitted PRs |
| **View LLM cache stats** | ❌ No | ✅ Yes | Hidden from customers - internal optimization |
| **Manage stream configs** | ❌ No | ✅ Yes | Internal administration only |
| **Process batches** | ✅ Yes (via PR gen) | ✅ Yes | Customers trigger via PR, admins see details |
| **Pagination for suggested changes** | ✅ Yes | ✅ Yes | Both views support pagination |
| **Refresh interval** | Manual | 15 seconds auto-refresh | Different update needs |

## Appendix C: Data Transformation Examples

### Example 1: INSERT Proposal → Add Update

**DocProposal Input:**
```json
{
  "id": 42,
  "conversationId": "conv-123",
  "page": "docs/getting-started.md",
  "updateType": "INSERT",
  "section": "Installation",
  "suggestedText": "Run `npm install near-api-js`",
  "reasoning": "User asked how to install the library",
  "status": "pending",
  "adminApproved": true,
  "adminReviewedBy": "admin",
  "createdAt": "2025-11-12T10:30:00Z"
}
```

**PendingUpdate Output:**
```json
{
  "id": "42",
  "sectionId": "docs/getting-started.md",
  "type": "add",
  "summary": "User asked how to install the library",
  "source": "Conversation conv-123",
  "status": "pending",
  "diffBefore": null,
  "diffAfter": "Run `npm install near-api-js`",
  "createdAt": "2025-11-12T10:30:00Z",
  "reviewedAt": null,
  "reviewedBy": null
}
```

### Example 2: UPDATE Proposal → Major Update

**DocProposal Input:**
```json
{
  "id": 43,
  "conversationId": "conv-124",
  "page": "docs/api-reference.md",
  "updateType": "UPDATE",
  "section": "Authentication",
  "suggestedText": "Use OAuth 2.0 for authentication",
  "editedText": "Use OAuth 2.0 or API keys for authentication",
  "reasoning": "Outdated auth method mentioned",
  "status": "approved",
  "adminApproved": true,
  "adminReviewedBy": "admin",
  "editedBy": "customer",
  "createdAt": "2025-11-12T09:00:00Z"
}
```

**PendingUpdate Output:**
```json
{
  "id": "43",
  "sectionId": "docs/api-reference.md",
  "type": "major",
  "summary": "Outdated auth method mentioned",
  "source": "Conversation conv-124",
  "status": "approved",
  "diffBefore": null,
  "diffAfter": "Use OAuth 2.0 or API keys for authentication",
  "createdAt": "2025-11-12T09:00:00Z",
  "reviewedAt": null,
  "reviewedBy": null
}
```

## Appendix D: Route Reorganization Plan

### Current Routes
```
/admin                   → Complex view (Admin.tsx)
/admin/legacy            → Simple view (AdminLegacy.tsx)
/admin/login             → Login page
```

### Target Routes (After Migration)
```
/admin                   → Simple customer view (refactored AdminLegacy.tsx)
/admin/advanced          → Complex view (renamed Admin.tsx)
/admin/login             → Login page (unchanged)
```

### Migration Path
1. **Deploy Phase 1:** Add `/admin/advanced` route pointing to current Admin.tsx
2. **Deploy Phase 2:** Refactor AdminLegacy.tsx to use new endpoints, keep at `/admin/legacy`
3. **Deploy Phase 3:** Test refactored view, gather feedback
4. **Deploy Phase 4:** Update `/admin` to point to refactored view
5. **Cleanup Phase:** Remove `/admin/legacy` route after stable

### Backwards Compatibility
- Keep `/admin/legacy` route for 2 weeks after migration
- Add deprecation notice to legacy view
- Redirect legacy users to new customer view with toast notification
