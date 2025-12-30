import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, Edit, MessageSquare, Eye, Code } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface UpdateCardProps {
  id: string;
  type: 'minor' | 'major' | 'add' | 'delete';
  section: string;
  summary: string;
  source: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected' | 'auto-applied';
  diff?: {
    before: string;
    after: string;
  };
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onEdit?: (id: string, data: { summary?: string; diffAfter?: string }) => void;
  onViewContext?: () => void;
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
  onEdit,
  onViewContext,
}: UpdateCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editedContent, setEditedContent] = useState(diff?.after || '');

  return (
    <Card className="bg-white border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-900" data-testid="text-section">
            {section}
          </span>
        </div>
        {(onApprove || onReject || onEdit) && (
          <div className="flex gap-2">
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditOpen(true)}
                data-testid={`button-edit-${id}`}
                className="text-gray-700 hover:bg-gray-100"
              >
                <Edit className="mr-1 h-4 w-4" />
                Edit
              </Button>
            )}
            {onApprove && (
              <Button
                size="sm"
                variant="default"
                onClick={() => onApprove?.(id)}
                data-testid={`button-approve-${id}`}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="mr-1 h-4 w-4" />
                Approve
              </Button>
            )}
            {onReject && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject?.(id)}
                data-testid={`button-reject-${id}`}
                className="border-gray-500 text-gray-900 hover:bg-gray-100 hover:border-gray-600"
              >
                <X className="mr-1 h-4 w-4" />
                {status === 'approved'
                  ? 'Unapprove'
                  : status === 'rejected'
                    ? 'Reset to Pending'
                    : 'Reject'}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Show proposal text first if available */}
        {diff && (
          <div className="bg-gray-50 p-3 rounded border border-gray-200">
            <div className="mb-1 text-xs font-semibold text-gray-700">Proposed Change:</div>
            <div className="prose prose-sm max-w-none text-gray-900">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {diff.after || '(No content)'}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Then show the reason/summary */}
        <div>
          <div className="mb-1 text-xs font-semibold text-gray-700">Reason:</div>
          <p className="text-sm text-gray-900" data-testid="text-summary">
            {summary}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span data-testid="text-source">Source: {source}</span>
            <span data-testid="text-timestamp">{timestamp}</span>
          </div>
        </div>

        {onViewContext && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={onViewContext}
              data-testid={`button-view-context-${id}`}
              className="text-xs border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <MessageSquare className="mr-1 h-3 w-3" />
              View Conversation Context
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-white [&>button]:text-gray-900 [&>button]:hover:bg-gray-100">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Edit Change Proposal</DialogTitle>
            <DialogDescription className="text-gray-600">
              Modify the AI-generated content before approving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {diff && (
              <div className="space-y-2">
                <Label className="text-gray-900">
                  {type === 'delete' ? 'Content to be deleted' : 'Proposed Content (Markdown)'}
                </Label>
                <Tabs defaultValue="edit" className="w-full">
                  <TabsList className="bg-gray-100">
                    <TabsTrigger
                      value="edit"
                      className="text-gray-700 data-[state=active]:bg-white"
                    >
                      <Code className="w-4 h-4 mr-1" />
                      Edit
                    </TabsTrigger>
                    <TabsTrigger
                      value="preview"
                      className="text-gray-700 data-[state=active]:bg-white"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit" className="mt-2">
                    <Textarea
                      id="edit-content"
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={16}
                      className="font-mono text-sm border-gray-300 text-gray-900 bg-white"
                      data-testid="textarea-edit-content"
                      disabled={type === 'delete'}
                      placeholder="Enter markdown content..."
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-2">
                    <div className="min-h-[400px] p-4 border border-gray-300 rounded-md bg-white">
                      <div className="prose prose-sm max-w-none text-gray-900">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {editedContent || '*No content to preview*'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                setEditedContent(diff?.after || '');
              }}
              data-testid="button-cancel-edit"
              className="border-gray-300 text-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onEdit?.(id, {
                  diffAfter: editedContent,
                });
                setEditOpen(false);
              }}
              data-testid="button-save-edit"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
