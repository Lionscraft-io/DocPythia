import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { UpdateCard } from "@/components/UpdateCard";
import { StatsCard } from "@/components/StatsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FileText, CheckCircle2, Clock, XCircle, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, adminApiRequest, getQueryFn } from "@/lib/queryClient";
import { PRPreviewModal, type PRSubmitData } from "@/components/PRPreviewModal";

export default function Admin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [conversationModalOpen, setConversationModalOpen] = useState(false);
  const [prModalOpen, setPrModalOpen] = useState(false);

  // Auth check
  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) {
      setLocation("/admin/login");
    }
  }, [setLocation]);

  // Fetch all conversations (pending, approved, ignored)
  const { data: pendingConvs, isLoading: loadingPending } = useQuery({
    queryKey: ["/api/admin/stream/conversations?status=pending&limit=100"],
    queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
  });

  const { data: approvedConvs, isLoading: loadingApproved } = useQuery({
    queryKey: ["/api/admin/stream/conversations?status=changeset&limit=100"],
    queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
  });

  const { data: ignoredConvs, isLoading: loadingIgnored } = useQuery({
    queryKey: ["/api/admin/stream/conversations?status=discarded&limit=100"],
    queryFn: getQueryFn({ on401: "throw", requiresAuth: true }),
  });

  // Get conversations (not flattened) so we can group proposals
  const pendingConversations = pendingConvs?.data || [];
  const approvedConversations = approvedConvs?.data || [];
  const ignoredConversations = ignoredConvs?.data || [];

  console.log('API returned:', {
    pending: pendingConversations.length,
    approved: approvedConversations.length,
    ignored: ignoredConversations.length
  });

  // Merge conversations from all statuses, deduplicating by conversation_id and combining proposals
  const allConversationsMap = new Map();
  [...pendingConversations, ...approvedConversations, ...ignoredConversations].forEach((conv: any) => {
    if (!conv) return;
    const existing = allConversationsMap.get(conv.conversation_id);
    if (existing) {
      // Merge proposals, avoiding duplicates
      const existingProposalIds = new Set(existing.proposals?.map((p: any) => p.id) || []);
      const newProposals = (conv.proposals || []).filter((p: any) => !existingProposalIds.has(p.id));
      existing.proposals = [...(existing.proposals || []), ...newProposals];
    } else {
      allConversationsMap.set(conv.conversation_id, { ...conv });
    }
  });
  const allConversations = Array.from(allConversationsMap.values()).filter(conv => {
    const hasProposals = conv.proposals && conv.proposals.length > 0;
    if (!hasProposals) {
      console.log('Filtering out conversation with 0 proposals:', conv.conversation_id, conv);
    }
    return hasProposals;
  });

  // Count proposals by status across all conversations
  const countProposalsByStatus = (convs: any[], status: string) => {
    return convs.reduce((sum, conv) => {
      const matchingProposals = conv.proposals?.filter((p: any) => p.status === status) || [];
      return sum + matchingProposals.length;
    }, 0);
  };

  const pendingCount = countProposalsByStatus(pendingConversations, 'pending');
  const approvedCount = countProposalsByStatus(approvedConversations, 'approved');
  const ignoredCount = countProposalsByStatus(ignoredConversations, 'ignored');

  // Total count is all proposals regardless of status
  const totalCount = allConversations.reduce((sum, conv) => sum + (conv.proposals?.length || 0), 0);

  const isLoading = loadingPending || loadingApproved || loadingIgnored;

  // Mutations (approve, reject, edit)
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await adminApiRequest("POST", `/api/admin/stream/proposals/${id}/status`, {
        status: "approved",
        reviewedBy: "admin"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=pending&limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=changeset&limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=discarded&limit=100"] });
      toast({
        title: "Update Approved",
        description: "The proposal has been approved and added to changeset.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve update.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      // If currently approved or ignored, reset to pending; otherwise ignore
      const newStatus = (currentStatus === 'approved' || currentStatus === 'ignored') ? 'pending' : 'ignored';
      return await adminApiRequest("POST", `/api/admin/stream/proposals/${id}/status`, {
        status: newStatus,
        reviewedBy: "admin"
      });
    },
    onSuccess: (data, variables) => {
      // Invalidate all conversation queries to refetch with updated proposal statuses
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=pending&limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=changeset&limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=discarded&limit=100"] });
      let title, message, variant;

      if (variables.currentStatus === 'approved') {
        title = "Update Unapproved";
        message = "The proposal has been unapproved and moved back to pending.";
        variant = "default";
      } else if (variables.currentStatus === 'ignored') {
        title = "Update Reset";
        message = "The ignored proposal has been reset to pending.";
        variant = "default";
      } else {
        title = "Update Rejected";
        message = "The proposal has been ignored.";
        variant = "destructive";
      }

      toast({ title, description: message, variant: variant as any });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update proposal.",
        variant: "destructive",
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { summary?: string; diffAfter?: string } }) => {
      // Only update the content text, reasoning/summary is not editable in the backend
      return await adminApiRequest("PATCH", `/api/admin/stream/proposals/${id}`, {
        suggestedText: data.diffAfter || "",
        editedBy: "admin"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=pending&limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=changeset&limit=100"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=discarded&limit=100"] });
      toast({
        title: "Update Edited",
        description: "The change proposal has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to edit update.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (id: string) => approveMutation.mutate(id);
  const handleReject = (id: string, currentStatus: string) => rejectMutation.mutate({ id, currentStatus });
  const handleEdit = (id: string, data: { summary?: string; diffAfter?: string }) => {
    editMutation.mutate({ id, data });
  };
  const handleViewContext = (context: any) => {
    setSelectedConversation(context);
    setConversationModalOpen(true);
  };
  const handleGeneratePR = () => {
    if (approvedCount === 0) {
      toast({
        title: "No Approved Changes",
        description: "Please approve some changes before generating a PR.",
        variant: "destructive",
      });
      return;
    }
    setPrModalOpen(true);
  };
  const handlePRSubmit = async (prData: PRSubmitData) => {
    // Extract proposal IDs from all approved conversations
    const proposalIds: number[] = [];
    approvedConversations.forEach((conv: any) => {
      conv.proposals?.forEach((proposal: any) => {
        if (proposal.status === 'approved') {
          proposalIds.push(proposal.id);
        }
      });
    });

    if (proposalIds.length === 0) {
      toast({
        title: "No Proposals",
        description: "No approved proposals found.",
        variant: "destructive",
      });
      return;
    }

    // Step 1: Create a draft batch
    const batchResponse = await adminApiRequest("POST", "/api/admin/stream/batches", {
      proposalIds
    });

    // Step 2: Generate PR from the batch
    await adminApiRequest("POST", `/api/admin/stream/batches/${batchResponse.batch.id}/generate-pr`, {
      ...prData,
      proposalIds,
    });

    queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=pending&limit=100"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=changeset&limit=100"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stream/conversations?status=discarded&limit=100"] });
    setPrModalOpen(false);
    toast({
      title: "Pull Request Created",
      description: "Your PR has been created successfully as a draft.",
    });
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <div className="container px-6 md:px-8 flex-1 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Loading updates...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      <div className="container px-6 md:px-8 flex-1 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-gray-900" data-testid="heading-admin">
              Admin Dashboard
            </h1>
            <p className="text-gray-600">
              Review and manage AI-suggested documentation updates
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleGeneratePR}
            disabled={approvedCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Generate PR ({approvedCount} approved)
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
          <TabsList className="bg-gray-100 border-gray-200">
            <TabsTrigger value="pending" data-testid="tab-pending" className="text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-900">
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved" className="text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-900">
              Approved ({approvedCount})
            </TabsTrigger>
            <TabsTrigger value="ignored" data-testid="tab-ignored" className="text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-900">
              Ignored ({ignoredCount})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all" className="text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-900">
              All Updates ({totalCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-6">
            {pendingConversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No pending updates</p>
              </div>
            ) : (
              pendingConversations
                .map((conv: any) => ({
                  ...conv,
                  filteredProposals: conv.proposals?.filter((p: any) => p.status === 'pending') || []
                }))
                .filter((conv: any) => conv.filteredProposals.length > 0)
                .map((conv: any) => (
                <Card key={conv.conversation_id} className="bg-white border-gray-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">Conversation</span>
                        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {conv.conversation_id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {conv.filteredProposals.length} proposal{conv.filteredProposals.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewContext({
                          conversation_id: conv.conversation_id,
                          category: conv.category,
                          messages: conv.messages || []
                        })}
                        className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <MessageSquare className="mr-1 h-3 w-3" />
                        View Context
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {conv.filteredProposals.map((proposal: any) => (
                      <UpdateCard
                        key={proposal.id}
                        id={proposal.id.toString()}
                        type={proposal.update_type === 'INSERT' ? 'add' : proposal.update_type === 'DELETE' ? 'delete' : proposal.update_type === 'UPDATE' ? 'major' : 'minor'}
                        section={proposal.page || 'Unknown section'}
                        summary={proposal.reasoning || 'Documentation update'}
                        source={`${conv.category || 'Chat'}`}
                        timestamp={formatTimestamp(proposal.created_at || conv.created_at)}
                        status={proposal.status === 'approved' ? 'approved' : proposal.status === 'ignored' ? 'rejected' : 'pending'}
                        diff={{
                          before: '',
                          after: proposal.edited_text || proposal.suggested_text || ''
                        }}
                        onApprove={handleApprove}
                        onReject={(id) => handleReject(id, proposal.status)}
                        onEdit={handleEdit}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-6">
            {approvedConversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No approved updates</p>
              </div>
            ) : (
              approvedConversations
                .map((conv: any) => ({
                  ...conv,
                  filteredProposals: conv.proposals?.filter((p: any) => p.status === 'approved') || []
                }))
                .filter((conv: any) => conv.filteredProposals.length > 0)
                .map((conv: any) => (
                <Card key={conv.conversation_id} className="bg-white border-gray-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">Conversation</span>
                        <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded">
                          {conv.conversation_id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {conv.filteredProposals.length} proposal{conv.filteredProposals.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewContext({
                          conversation_id: conv.conversation_id,
                          category: conv.category,
                          messages: conv.messages || []
                        })}
                        className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <MessageSquare className="mr-1 h-3 w-3" />
                        View Context
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {conv.filteredProposals.map((proposal: any) => (
                      <UpdateCard
                        key={proposal.id}
                        id={proposal.id.toString()}
                        type={proposal.update_type === 'INSERT' ? 'add' : proposal.update_type === 'DELETE' ? 'delete' : proposal.update_type === 'UPDATE' ? 'major' : 'minor'}
                        section={proposal.page || 'Unknown section'}
                        summary={proposal.reasoning || 'Documentation update'}
                        source={`${conv.category || 'Chat'}`}
                        timestamp={formatTimestamp(proposal.created_at || conv.created_at)}
                        status={proposal.status === 'approved' ? 'approved' : proposal.status === 'ignored' ? 'rejected' : 'pending'}
                        diff={{
                          before: '',
                          after: proposal.edited_text || proposal.suggested_text || ''
                        }}
                        onEdit={handleEdit}
                        onReject={(id) => handleReject(id, proposal.status)}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="ignored" className="space-y-6">
            {ignoredConversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No ignored updates</p>
              </div>
            ) : (
              ignoredConversations
                .map((conv: any) => ({
                  ...conv,
                  filteredProposals: conv.proposals?.filter((p: any) => p.status === 'ignored') || []
                }))
                .filter((conv: any) => conv.filteredProposals.length > 0)
                .map((conv: any) => (
                <Card key={conv.conversation_id} className="bg-white border-gray-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">Conversation</span>
                        <span className="text-xs font-mono bg-gray-50 text-gray-700 px-2 py-0.5 rounded">
                          {conv.conversation_id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {conv.filteredProposals.length} proposal{conv.filteredProposals.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewContext({
                          conversation_id: conv.conversation_id,
                          category: conv.category,
                          messages: conv.messages || []
                        })}
                        className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <MessageSquare className="mr-1 h-3 w-3" />
                        View Context
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {conv.filteredProposals.map((proposal: any) => (
                      <UpdateCard
                        key={proposal.id}
                        id={proposal.id.toString()}
                        type={proposal.update_type === 'INSERT' ? 'add' : proposal.update_type === 'DELETE' ? 'delete' : proposal.update_type === 'UPDATE' ? 'major' : 'minor'}
                        section={proposal.page || 'Unknown section'}
                        summary={proposal.reasoning || 'Documentation update'}
                        source={`${conv.category || 'Chat'}`}
                        timestamp={formatTimestamp(proposal.created_at || conv.created_at)}
                        status={proposal.status === 'approved' ? 'approved' : proposal.status === 'ignored' ? 'rejected' : 'pending'}
                        diff={{
                          before: '',
                          after: proposal.edited_text || proposal.suggested_text || ''
                        }}
                        onReject={(id) => handleReject(id, proposal.status)}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-6">
            {allConversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No updates</p>
              </div>
            ) : (
              allConversations.map((conv: any) => (
                <Card key={conv.conversation_id} className="bg-white border-gray-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">Conversation</span>
                        <span className="text-xs font-mono bg-gray-50 text-gray-700 px-2 py-0.5 rounded">
                          {conv.conversation_id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {conv.proposals?.length || 0} proposal{conv.proposals?.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewContext({
                          conversation_id: conv.conversation_id,
                          category: conv.category,
                          messages: conv.messages || []
                        })}
                        className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <MessageSquare className="mr-1 h-3 w-3" />
                        View Context
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {conv.proposals?.map((proposal: any) => (
                      <UpdateCard
                        key={proposal.id}
                        id={proposal.id.toString()}
                        type={proposal.update_type === 'INSERT' ? 'add' : proposal.update_type === 'DELETE' ? 'delete' : proposal.update_type === 'UPDATE' ? 'major' : 'minor'}
                        section={proposal.page || 'Unknown section'}
                        summary={proposal.reasoning || 'Documentation update'}
                        source={`${conv.category || 'Chat'}`}
                        timestamp={formatTimestamp(proposal.created_at || conv.created_at)}
                        status={proposal.status === 'approved' ? 'approved' : proposal.status === 'ignored' ? 'rejected' : 'pending'}
                        diff={{
                          before: '',
                          after: proposal.edited_text || proposal.suggested_text || ''
                        }}
                        onApprove={proposal.status === 'pending' ? handleApprove : undefined}
                        onReject={(id) => handleReject(id, proposal.status)}
                        onEdit={proposal.status !== 'ignored' ? handleEdit : undefined}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Conversation Context Modal */}
        <Dialog open={conversationModalOpen} onOpenChange={setConversationModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-white [&>button]:text-gray-900 [&>button]:hover:bg-gray-100">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Conversation Context</DialogTitle>
              <DialogDescription className="text-gray-600">
                Messages that led to this documentation suggestion
              </DialogDescription>
            </DialogHeader>

            {selectedConversation && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">Category:</span>
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {selectedConversation.category}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto font-mono">
                    {selectedConversation.conversation_id}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">Messages ({selectedConversation.messages.length})</h4>
                  {selectedConversation.messages.map((msg: any, idx: number) => (
                    <div key={msg.id || idx} className="bg-gray-50 p-4 rounded border border-gray-200">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <span className="font-medium text-gray-900">{msg.author}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-600">{msg.channel}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-600">
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* PR Preview Modal */}
        <PRPreviewModal
          isOpen={prModalOpen}
          onClose={() => setPrModalOpen(false)}
          approvedProposals={(() => {
            const proposals: any[] = [];
            approvedConversations.forEach((conv: any) => {
              conv.proposals?.forEach((proposal: any) => {
                if (proposal.status === 'approved') {
                  proposals.push({
                    ...proposal,
                    id: proposal.id,
                    page: proposal.page,
                    suggested_text: proposal.suggested_text || proposal.edited_text
                  });
                }
              });
            });
            return proposals;
          })()}
          onSubmit={handlePRSubmit}
        />
      </div>
    </div>
  );
}
