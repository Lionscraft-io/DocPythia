import { useState } from "react";
import { Header } from "@/components/Header";
import { UpdateCard } from "@/components/UpdateCard";
import { StatsCard } from "@/components/StatsCard";
import { FileText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { toast } = useToast();
  const [updates, setUpdates] = useState<Array<{
    id: string;
    type: "minor" | "major";
    section: string;
    summary: string;
    source: string;
    timestamp: string;
    status: "pending" | "approved" | "rejected" | "auto-applied";
    diff?: {
      before: string;
      after: string;
    };
  }>>([
    {
      id: "1",
      type: "major",
      section: "Validator / Hardware Requirements",
      summary: "Updated minimum CPU requirements based on recent network performance data from Zulipchat discussions",
      source: "Zulipchat #community-support",
      timestamp: "2 hours ago",
      status: "pending",
      diff: {
        before: "Minimum 4 CPU cores required for running a validator node",
        after: "Minimum 8 CPU cores recommended for optimal validator performance and reliability",
      },
    },
    {
      id: "2",
      type: "minor",
      section: "RPC / Configuration",
      summary: "Fixed typo in RPC endpoint configuration example",
      source: "Zulipchat #community-support",
      timestamp: "4 hours ago",
      status: "auto-applied",
    },
    {
      id: "3",
      type: "major",
      section: "Archival / Storage",
      summary: "Added new section about storage optimization strategies for archival nodes",
      source: "Zulipchat #community-support",
      timestamp: "1 day ago",
      status: "pending",
      diff: {
        before: "Plan for adequate storage space",
        after: "Implement tiered storage strategy: NVMe for recent data, HDD for historical states older than 6 months",
      },
    },
    {
      id: "4",
      type: "minor",
      section: "Validator / Monitoring",
      summary: "Updated monitoring tool recommendations",
      source: "Zulipchat #community-support",
      timestamp: "2 days ago",
      status: "approved",
    },
    {
      id: "5",
      type: "major",
      section: "RPC / Security",
      summary: "Proposed changes to DDoS protection section were not applicable",
      source: "Zulipchat #community-support",
      timestamp: "3 days ago",
      status: "rejected",
    },
  ]);

  const handleApprove = (id: string) => {
    setUpdates(updates.map(u => u.id === id ? { ...u, status: "approved" as "approved" } : u));
    toast({
      title: "Update Approved",
      description: "The documentation has been updated successfully.",
    });
  };

  const handleReject = (id: string) => {
    setUpdates(updates.map(u => u.id === id ? { ...u, status: "rejected" as "rejected" } : u));
    toast({
      title: "Update Rejected",
      description: "The proposed change has been rejected.",
      variant: "destructive",
    });
  };

  const pendingCount = updates.filter(u => u.status === "pending").length;
  const approvedCount = updates.filter(u => u.status === "approved").length;
  const autoAppliedCount = updates.filter(u => u.status === "auto-applied").length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="container flex-1 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="heading-admin">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Review and manage AI-suggested documentation updates
          </p>
        </div>

        <div className="grid gap-6 mb-8 md:grid-cols-4">
          <StatsCard
            title="Total Updates"
            value={updates.length}
            icon={FileText}
            description="All time"
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
            description="This week"
          />
          <StatsCard
            title="Auto-Applied"
            value={autoAppliedCount}
            icon={CheckCircle2}
            description="Minor changes"
          />
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Approved
            </TabsTrigger>
            <TabsTrigger value="auto-applied" data-testid="tab-auto-applied">
              Auto-Applied
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All Updates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {updates.filter(u => u.status === "pending").length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No pending updates</p>
              </div>
            ) : (
              updates
                .filter(u => u.status === "pending")
                .map(update => (
                  <UpdateCard
                    key={update.id}
                    {...update}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            {updates
              .filter(u => u.status === "approved")
              .map(update => (
                <UpdateCard key={update.id} {...update} />
              ))}
          </TabsContent>

          <TabsContent value="auto-applied" className="space-y-4">
            {updates
              .filter(u => u.status === "auto-applied")
              .map(update => (
                <UpdateCard key={update.id} {...update} />
              ))}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {updates.map(update => (
              <UpdateCard
                key={update.id}
                {...update}
                onApprove={update.status === "pending" ? handleApprove : undefined}
                onReject={update.status === "pending" ? handleReject : undefined}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
