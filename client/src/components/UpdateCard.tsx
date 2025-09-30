import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface UpdateCardProps {
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
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function UpdateCard({
  id,
  type,
  section,
  summary,
  source,
  timestamp,
  status,
  diff,
  onApprove,
  onReject,
}: UpdateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pending: { color: "bg-chart-3", icon: Clock, label: "Pending Review" },
    approved: { color: "bg-chart-2", icon: Check, label: "Approved" },
    rejected: { color: "bg-destructive", icon: X, label: "Rejected" },
    "auto-applied": { color: "bg-muted", icon: Check, label: "Auto-Applied" },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={type === "major" ? "default" : "secondary"} data-testid={`badge-type-${type}`}>
            {type === "major" ? "Major" : "Minor"}
          </Badge>
          <Badge variant="outline" className={`${config.color} text-white`} data-testid={`badge-status-${status}`}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
          <span className="text-sm text-muted-foreground" data-testid="text-section">
            {section}
          </span>
        </div>
        {status === "pending" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => onApprove?.(id)}
              data-testid={`button-approve-${id}`}
            >
              <Check className="mr-1 h-4 w-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject?.(id)}
              data-testid={`button-reject-${id}`}
            >
              <X className="mr-1 h-4 w-4" />
              Reject
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm" data-testid="text-summary">{summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span data-testid="text-source">Source: {source}</span>
            <span data-testid="text-timestamp">{timestamp}</span>
          </div>
        </div>

        {diff && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              data-testid={`button-toggle-diff-${id}`}
              className="text-xs"
            >
              {expanded ? (
                <>
                  <ChevronUp className="mr-1 h-3 w-3" />
                  Hide Changes
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3 w-3" />
                  Show Changes
                </>
              )}
            </Button>

            {expanded && (
              <div className="mt-2 grid gap-2 rounded-md border p-3 text-xs font-mono md:grid-cols-2">
                <div>
                  <div className="mb-1 font-semibold text-destructive">Before:</div>
                  <div className="rounded bg-destructive/10 p-2" data-testid="text-diff-before">
                    {diff.before}
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-semibold text-chart-2">After:</div>
                  <div className="rounded bg-chart-2/10 p-2" data-testid="text-diff-after">
                    {diff.after}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
