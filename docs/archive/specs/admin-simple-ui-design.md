# Admin Simple UI Design - Technical Specification

**Spec ID:** admin-simple-ui-design
**Created by:** Wayne
**Date:** 2025-11-12
**Status:** Draft
**Related Spec:** admin-customer-view-mapping.md

## 1. Problem Statement

The current `/admin` customer view still uses the complex conversation-based UI from AdminAdvanced.tsx. Wayne wants the **SIMPLE card-based design from AdminLegacy.tsx** but powered by the **current backend multi-stream APIs**.

### Current State (Wrong)

`/admin` currently shows:
- ✅ Conversation threads with nested proposals
- ✅ Multiple messages per conversation
- ✅ RAG context sections
- ✅ Complex nested structure
- ❌ **This is NOT what customers should see**

### Desired State (Correct)

`/admin` should show (like AdminLegacy):
- ✅ Simple list of individual documentation changes (UpdateCard components)
- ✅ Clean 4-tab interface: Pending, Approved, Ignored, All
- ✅ 4 stats cards at top
- ✅ Simple approve/reject/edit buttons
- ✅ **Plus:** PR generation button
- ✅ **Plus:** View conversation context (expandable/modal)
- ❌ **Hide:** RAG analysis, LLM cache, unprocessed messages

## 2. Design Comparison

### AdminLegacy.tsx Design (Target)

```
┌─────────────────────────────────────────────────────────────┐
│ Admin Dashboard                                              │
│ Review and manage AI-suggested documentation updates        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Total    │  │ Pending  │  │ Approved │  │ Auto-    │   │
│  │ Updates  │  │ Review   │  │          │  │ Applied  │   │
│  │   42     │  │   12     │  │   25     │  │    5     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
├─────────────────────────────────────────────────────────────┤
│ [Pending (12)] [Approved] [Auto-Applied] [All Updates]     │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐  │
│ │ UpdateCard                                             │  │
│ │ - Section: docs/getting-started.md                    │  │
│ │ - Summary: Add installation instructions              │  │
│ │ - Source: Conversation 123                            │  │
│ │ - Diff (expandable)                                    │  │
│ │ [Approve] [Reject] [Edit]                             │  │
│ └───────────────────────────────────────────────────────┘  │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ UpdateCard                                             │  │
│ │ ...                                                    │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Current Admin.tsx Design (Wrong for Customers)

```
┌─────────────────────────────────────────────────────────────┐
│ Admin Dashboard                                              │
├─────────────────────────────────────────────────────────────┤
│ [Suggested Changes] [Changeset] [Discarded] [PR History]   │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Conversation Thread                                    │  │
│ │ Category: Documentation • 5 Proposals                  │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │ Thread Analysis: Important update about...            │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │ Messages:                                              │  │
│ │  ┌─────────────────────────────────────────────────┐  │  │
│ │  │ Author: user123 • #general • 10:30 AM           │  │  │
│ │  │ Message content here...                          │  │  │
│ │  └─────────────────────────────────────────────────┘  │  │
│ │  ┌─────────────────────────────────────────────────┐  │  │
│ │  │ Author: user456 • #general • 10:35 AM           │  │  │
│ │  │ Reply message...                                 │  │  │
│ │  └─────────────────────────────────────────────────┘  │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │ RAG Analysis:                                          │  │
│ │ Retrieved 3 docs • 1250 tokens                        │  │
│ │ ...                                                    │  │
│ │ ─────────────────────────────────────────────────────  │  │
│ │ Proposals:                                             │  │
│ │  ┌─────────────────────────────────────────────────┐  │  │
│ │  │ Proposal #1: INSERT docs/api.md                 │  │  │
│ │  │ ...                                              │  │  │
│ │  └─────────────────────────────────────────────────┘  │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Problem:** Too complex, shows internal processing details, conversation-based grouping

## 3. Data Transformation Required

### Backend Data (Current)

```typescript
// GET /api/admin/stream/conversations?status=pending
{
  data: [
    {
      conversation_id: "conv-123",
      category: "Documentation",
      message_count: 5,
      messages: [
        { id: 1, author: "user123", content: "How do I install?", ... },
        { id: 2, author: "user456", content: "Check docs...", ... }
      ],
      rag_context: {
        retrieved_docs: [...],
        total_tokens: 1250,
        ...
      },
      proposals: [
        {
          id: 42,
          page: "docs/getting-started.md",
          updateType: "INSERT",
          suggestedText: "npm install near-api-js",
          reasoning: "User asked about installation",
          status: "pending",
          ...
        },
        {
          id: 43,
          page: "docs/api.md",
          updateType: "UPDATE",
          ...
        }
      ]
    }
  ]
}
```

### Frontend Display (Desired - Flattened)

```typescript
// Transform each proposal into an UpdateCard

updates: [
  {
    id: "42",
    sectionId: "docs/getting-started.md",
    type: "add",
    summary: "User asked about installation",
    source: "Conversation conv-123",
    status: "pending",
    diffAfter: "npm install near-api-js",
    conversationContext: {  // NEW: Store for modal/expand
      messages: [...],
      category: "Documentation",
      conversation_id: "conv-123"
    }
  },
  {
    id: "43",
    sectionId: "docs/api.md",
    type: "major",
    ...
  }
]
```

**Key Transformation:**
- **Flatten:** Extract each proposal from conversations
- **Hide RAG:** Don't show RAG context in main view
- **Store context:** Keep conversation messages in each update for optional viewing
- **Simple cards:** Each proposal becomes one UpdateCard

## 4. Proposed UI Structure

### Header Section
```tsx
<div className="mb-8">
  <h1>Admin Dashboard</h1>
  <p>Review and manage AI-suggested documentation updates</p>
  <Button>Generate PR from Approved Changes</Button>  {/* NEW */}
</div>
```

### Stats Cards (Keep from Legacy)
```tsx
<div className="grid gap-6 mb-8 md:grid-cols-4">
  <StatsCard title="Total Updates" value={totalCount} />
  <StatsCard title="Pending Review" value={pendingCount} />
  <StatsCard title="Approved" value={approvedCount} />
  <StatsCard title="Ignored" value={ignoredCount} />
</div>
```

### Tabs (Simplified from Legacy)
```tsx
<Tabs defaultValue="pending">
  <TabsList>
    <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
    <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
    <TabsTrigger value="ignored">Ignored ({ignoredCount})</TabsTrigger>
    <TabsTrigger value="all">All Updates</TabsTrigger>
  </TabsList>

  <TabsContent value="pending">
    {flattenedUpdates
      .filter(u => u.status === "pending")
      .map(update => (
        <UpdateCard
          key={update.id}
          {...update}
          onApprove={handleApprove}
          onReject={handleReject}
          onEdit={handleEdit}
          onViewContext={() => openConversationModal(update.conversationContext)}  {/* NEW */}
        />
      ))}
  </TabsContent>

  {/* Similar for approved, ignored, all */}
</Tabs>
```

### UpdateCard Enhancements

Add "View Conversation" button to existing UpdateCard:

```tsx
<UpdateCard>
  {/* Existing content */}
  <div className="flex gap-2">
    <Button onClick={onApprove}>Approve</Button>
    <Button onClick={onReject}>Reject</Button>
    <Button onClick={onEdit}>Edit</Button>
    <Button variant="outline" onClick={onViewContext}>  {/* NEW */}
      View Conversation Context
    </Button>
  </div>
</UpdateCard>
```

### Conversation Context Modal (NEW)

```tsx
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Conversation Context</DialogTitle>
      <DialogDescription>
        Messages that led to this suggestion
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-3">
      {conversationMessages.map(msg => (
        <div key={msg.id} className="bg-gray-50 p-4 rounded">
          <div className="text-sm">
            <span className="font-medium">{msg.author}</span>
            <span className="text-gray-400"> • </span>
            <span>{msg.channel}</span>
            <span className="text-gray-400"> • </span>
            <span>{new Date(msg.timestamp).toLocaleString()}</span>
          </div>
          <p className="text-sm mt-2">{msg.content}</p>
        </div>
      ))}
    </div>
  </DialogContent>
</Dialog>
```

## 5. Implementation Steps

### Step 1: Create Data Transformer Service

**File:** `client/src/services/proposalFlattener.ts`

```typescript
import type { PendingUpdate } from "@shared/schema";

export interface ConversationData {
  conversation_id: string;
  category: string;
  messages: any[];
  rag_context?: any;
  proposals: any[];
}

export interface FlattenedUpdate extends PendingUpdate {
  conversationContext: {
    conversation_id: string;
    category: string;
    messages: any[];
  };
}

export function flattenConversations(conversations: ConversationData[]): FlattenedUpdate[] {
  const flattened: FlattenedUpdate[] = [];

  for (const conv of conversations) {
    for (const proposal of conv.proposals || []) {
      flattened.push({
        id: proposal.id.toString(),
        sectionId: proposal.page,
        type: mapUpdateType(proposal.updateType),
        summary: proposal.reasoning || "Documentation update",
        source: `Conversation ${conv.conversation_id}`,
        status: mapStatus(proposal.status),
        diffBefore: null,
        diffAfter: proposal.editedText || proposal.suggestedText,
        createdAt: proposal.createdAt,
        reviewedAt: proposal.adminReviewedAt,
        reviewedBy: proposal.adminReviewedBy,
        conversationContext: {
          conversation_id: conv.conversation_id,
          category: conv.category,
          messages: conv.messages
        }
      });
    }
  }

  return flattened;
}

function mapUpdateType(updateType: string): "minor" | "major" | "add" | "delete" {
  const mapping = {
    'INSERT': 'add',
    'UPDATE': 'major',
    'DELETE': 'delete',
    'NONE': 'minor'
  };
  return mapping[updateType] || 'major';
}

function mapStatus(status: string): "pending" | "approved" | "rejected" {
  const mapping = {
    'pending': 'pending',
    'approved': 'approved',
    'ignored': 'rejected'
  };
  return mapping[status] || 'pending';
}
```

### Step 2: Refactor Admin.tsx to Use Simple Design

**File:** `client/src/pages/Admin.tsx`

```typescript
import { useState } from "react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { UpdateCard } from "@/components/UpdateCard";
import { StatsCard } from "@/components/StatsCard";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, adminApiRequest, getQueryFn } from "@/lib/queryClient";
import { flattenConversations, type FlattenedUpdate } from "@/services/proposalFlattener";

export default function Admin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [conversationModalOpen, setConversationModalOpen] = useState(false);

  // Auth check
  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) {
      setLocation("/admin/login");
    }
  }, [setLocation]);

  // Fetch all conversations (pending, approved, ignored)
  const { data: pendingConvs } = useQuery({
    queryKey: ["/api/admin/stream/conversations?status=pending&limit=100"],
    queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
  });

  const { data: approvedConvs } = useQuery({
    queryKey: ["/api/admin/stream/conversations?status=changeset&limit=100"],
    queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
  });

  const { data: ignoredConvs } = useQuery({
    queryKey: ["/api/admin/stream/conversations?status=discarded&limit=100"],
    queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
  });

  // Flatten all conversations into updates
  const pendingUpdates = flattenConversations(pendingConvs?.data || []);
  const approvedUpdates = flattenConversations(approvedConvs?.data || []);
  const ignoredUpdates = flattenConversations(ignoredConvs?.data || []);
  const allUpdates = [...pendingUpdates, ...approvedUpdates, ...ignoredUpdates];

  // Counts for stats
  const pendingCount = pendingUpdates.length;
  const approvedCount = approvedUpdates.length;
  const ignoredCount = ignoredUpdates.length;
  const totalCount = allUpdates.length;

  // Mutations (approve, reject, edit)
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await adminApiRequest("POST", `/api/admin/stream/proposals/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Update Approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return await adminApiRequest("POST", `/api/admin/stream/proposals/${id}/ignore`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Update Rejected" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await adminApiRequest("PATCH", `/api/admin/stream/proposals/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Update Edited" });
    },
  });

  const handleApprove = (id: string) => approveMutation.mutate(id);
  const handleReject = (id: string) => rejectMutation.mutate(id);
  const handleEdit = (id: string, data: any) => editMutation.mutate({ id, data });
  const handleViewContext = (context: any) => {
    setSelectedConversation(context);
    setConversationModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="container px-6 md:px-8 flex-1 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground">
              Review and manage AI-suggested documentation updates
            </p>
          </div>
          <Button size="lg">
            Generate PR from Approved Changes
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 mb-8 md:grid-cols-4">
          <StatsCard
            title="Total Updates"
            value={totalCount}
            icon={FileText}
            description="All proposals"
          />
          <StatsCard
            title="Pending Review"
            value={pendingCount}
            icon={Clock}
            description="Awaiting approval"
          />
          <StatsCard
            title="Approved"
            value={approvedCount}
            icon={CheckCircle2}
            description="Ready for PR"
          />
          <StatsCard
            title="Ignored"
            value={ignoredCount}
            icon={XCircle}
            description="Rejected proposals"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({approvedCount})
            </TabsTrigger>
            <TabsTrigger value="ignored">
              Ignored ({ignoredCount})
            </TabsTrigger>
            <TabsTrigger value="all">
              All Updates ({totalCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingUpdates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No pending updates</p>
              </div>
            ) : (
              pendingUpdates.map(update => (
                <UpdateCard
                  key={update.id}
                  {...update}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onEdit={handleEdit}
                  onViewContext={() => handleViewContext(update.conversationContext)}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            {approvedUpdates.map(update => (
              <UpdateCard
                key={update.id}
                {...update}
                onViewContext={() => handleViewContext(update.conversationContext)}
              />
            ))}
          </TabsContent>

          <TabsContent value="ignored" className="space-y-4">
            {ignoredUpdates.map(update => (
              <UpdateCard
                key={update.id}
                {...update}
                onViewContext={() => handleViewContext(update.conversationContext)}
              />
            ))}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {allUpdates.map(update => (
              <UpdateCard
                key={update.id}
                {...update}
                onApprove={update.status === "pending" ? handleApprove : undefined}
                onReject={update.status === "pending" ? handleReject : undefined}
                onViewContext={() => handleViewContext(update.conversationContext)}
              />
            ))}
          </TabsContent>
        </Tabs>

        {/* Conversation Context Modal */}
        <Dialog open={conversationModalOpen} onOpenChange={setConversationModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conversation Context</DialogTitle>
              <DialogDescription>
                Messages that led to this documentation suggestion
              </DialogDescription>
            </DialogHeader>

            {selectedConversation && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Category:</span>
                  <span className="text-sm bg-blue-100 px-2 py-1 rounded">
                    {selectedConversation.category}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto font-mono">
                    {selectedConversation.conversation_id}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Messages ({selectedConversation.messages.length})</h4>
                  {selectedConversation.messages.map((msg: any) => (
                    <div key={msg.id} className="bg-gray-50 p-4 rounded border">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <span className="font-medium">{msg.author}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-600">{msg.channel}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-600">
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
```

### Step 3: Update UpdateCard Component

**File:** `client/src/components/UpdateCard.tsx`

Add `onViewContext` prop:

```typescript
interface UpdateCardProps {
  // ... existing props
  onViewContext?: () => void;  // NEW
}

export function UpdateCard({ ..., onViewContext }: UpdateCardProps) {
  return (
    <Card>
      {/* ... existing content */}

      <div className="flex gap-2">
        {onApprove && <Button onClick={() => onApprove(id)}>Approve</Button>}
        {onReject && <Button onClick={() => onReject(id)}>Reject</Button>}
        {onEdit && <Button onClick={() => setEditMode(true)}>Edit</Button>}
        {onViewContext && (
          <Button variant="outline" onClick={onViewContext}>
            View Conversation
          </Button>
        )}
      </div>
    </Card>
  );
}
```

## 6. Summary

**Design Goal:** Simple, clean interface like AdminLegacy.tsx

**Key Changes:**
1. ✅ Flatten conversation → proposal structure into individual UpdateCards
2. ✅ Use simple 4-tab interface (Pending, Approved, Ignored, All)
3. ✅ Show 4 stats cards at top
4. ✅ Add "View Conversation" button to each UpdateCard
5. ✅ Show conversation context in modal (not inline)
6. ✅ Add "Generate PR" button at top
7. ❌ Hide RAG analysis completely
8. ❌ Hide LLM cache completely
9. ❌ Hide unprocessed messages completely

**Data Flow:**
```
Backend Conversations → Flatten to Updates → Display in UpdateCards → Modal for context
```

This maintains the **simple, customer-friendly design** of AdminLegacy while using the **current backend APIs** and allowing customers to **view conversation context when needed**.
