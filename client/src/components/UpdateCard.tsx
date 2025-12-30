import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, Edit, MessageSquare, Eye, Code, ExternalLink, FileText } from 'lucide-react';
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
import { useState, useEffect } from 'react';
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
  gitUrl?: string;
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
  gitUrl,
  onApprove,
  onReject,
  onEdit,
  onViewContext,
}: UpdateCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editedContent, setEditedContent] = useState(diff?.after || '');
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Build the GitHub URL for the file
  const buildGitHubUrl = (filePath: string): string => {
    if (!gitUrl) return '';
    const cleanBaseUrl = gitUrl.replace(/\.git$/, '');
    return `${cleanBaseUrl}/blob/main/${filePath}`;
  };

  // Fetch file content when preview is opened
  useEffect(() => {
    if (filePreviewOpen && !fileContent && !fileLoading) {
      setFileLoading(true);
      setFileError(null);

      // The section is the file path - fetch from API
      fetch(`/api/docs/${encodeURIComponent(section)}`)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error('File not found');
          }
          const data = await res.json();
          setFileContent(data.content || data.currentContent || '');
        })
        .catch((err) => {
          setFileError(err.message || 'Failed to load file');
        })
        .finally(() => {
          setFileLoading(false);
        });
    }
  }, [filePreviewOpen, fileContent, fileLoading, section]);

  const handleOpenFilePreview = () => {
    setFilePreviewOpen(true);
  };

  const handleOpenInNewTab = () => {
    const url = buildGitHubUrl(section);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card className="bg-white border-gray-200">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-xs font-mono px-2 py-1 rounded border ${
              type === 'add'
                ? 'bg-blue-50 text-blue-800 border-blue-200'
                : type === 'delete'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-green-50 text-green-800 border-green-200'
            }`}
            data-testid="badge-type"
          >
            {type === 'add'
              ? 'NEW SECTION'
              : type === 'delete'
                ? 'SECTION DELETION'
                : 'SECTION UPDATE'}
          </span>
          <button
            onClick={handleOpenFilePreview}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1"
            data-testid="text-section"
            title="Click to preview file content"
          >
            <FileText className="h-4 w-4" />
            {section}
          </button>
          {gitUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleOpenInNewTab}
              className="h-6 w-6 p-0 text-gray-500 hover:text-blue-600"
              title="Open in GitHub"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
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

      {/* File Preview Dialog */}
      <Dialog open={filePreviewOpen} onOpenChange={setFilePreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden bg-white [&>button]:text-gray-900 [&>button]:hover:bg-gray-100">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {section}
            </DialogTitle>
            <DialogDescription className="text-gray-600 flex items-center gap-2">
              Current file content
              {gitUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenInNewTab}
                  className="h-6 text-xs border-gray-300 text-gray-600 hover:text-blue-600"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open in GitHub
                </Button>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] border border-gray-200 rounded-md p-4 bg-gray-50">
            {fileLoading && (
              <div className="flex items-center justify-center py-8 text-gray-500">
                Loading file content...
              </div>
            )}
            {fileError && (
              <div className="flex items-center justify-center py-8 text-red-500">
                Error: {fileError}
              </div>
            )}
            {!fileLoading && !fileError && fileContent && (
              <div className="prose prose-sm max-w-none text-gray-900">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
              </div>
            )}
            {!fileLoading && !fileError && !fileContent && (
              <div className="flex items-center justify-center py-8 text-gray-500">
                No content available
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFilePreviewOpen(false)}
              className="border-gray-300 text-gray-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
