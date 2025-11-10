/**
 * PRPreviewModal
 * Modal for previewing and configuring PR generation from approved changesets
 *
 * @author Wayne
 * @created 2025-11-06
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { AlertCircle, FileText, GitPullRequest, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

interface PRPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedProposals: any[];
  onSubmit: (prData: PRSubmitData) => Promise<void>;
}

export interface PRSubmitData {
  targetRepo: string;
  sourceRepo: string;
  baseBranch: string;
  prTitle: string;
  prBody: string;
  submittedBy: string;
}

export function PRPreviewModal({ isOpen, onClose, approvedProposals, onSubmit }: PRPreviewModalProps) {
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [targetRepo, setTargetRepo] = useState('');
  const [sourceRepo, setSourceRepo] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [submittedBy, setSubmittedBy] = useState('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    pr?: { url: string; number: number };
    appliedCount?: number;
    failedCount?: number;
    error?: string;
  } | null>(null);

  // Group proposals by file
  const proposalsByFile = approvedProposals.reduce((acc, proposal) => {
    const file = proposal.page;
    if (!acc[file]) {
      acc[file] = [];
    }
    acc[file].push(proposal);
    return acc;
  }, {} as Record<string, any[]>);

  const affectedFiles = Object.keys(proposalsByFile);
  const totalProposals = approvedProposals.length;

  const handleSubmit = async () => {
    if (!prTitle.trim() || !targetRepo.trim() || !sourceRepo.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      await onSubmit({
        targetRepo: targetRepo.trim(),
        sourceRepo: sourceRepo.trim(),
        baseBranch: baseBranch.trim(),
        prTitle: prTitle.trim(),
        prBody: prBody.trim(),
        submittedBy: submittedBy.trim()
      });

      setSubmitResult({
        success: true,
        appliedCount: totalProposals,
        failedCount: 0
      });
    } catch (error: any) {
      setSubmitResult({
        success: false,
        error: error.message || 'Failed to generate PR'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setPrTitle('');
      setPrBody('');
      setSubmitResult(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" />
            Generate Pull Request
          </DialogTitle>
          <DialogDescription>
            Review and configure your pull request for {totalProposals} approved proposals across {affectedFiles.length} files.
          </DialogDescription>
        </DialogHeader>

        {submitResult ? (
          <div className="space-y-4">
            {submitResult.success ? (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900">
                  <div className="space-y-2">
                    <p className="font-semibold">Pull request created successfully!</p>
                    {submitResult.pr && (
                      <p>
                        PR #{submitResult.pr.number}: <a href={submitResult.pr.url} target="_blank" rel="noopener noreferrer" className="underline">{submitResult.pr.url}</a>
                      </p>
                    )}
                    <p className="text-sm">
                      Applied {submitResult.appliedCount} proposals successfully
                      {submitResult.failedCount! > 0 && ` (${submitResult.failedCount} failed)`}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-red-500 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-900">
                  <div className="space-y-2">
                    <p className="font-semibold">Failed to generate pull request</p>
                    <p className="text-sm">{submitResult.error}</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Section */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <h3 className="font-semibold text-blue-900">Changeset Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Total Proposals:</span>
                  <span className="ml-2 font-semibold">{totalProposals}</span>
                </div>
                <div>
                  <span className="text-blue-700">Affected Files:</span>
                  <span className="ml-2 font-semibold">{affectedFiles.length}</span>
                </div>
              </div>
            </div>

            {/* Affected Files Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Affected Files</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-gray-50">
                <ul className="space-y-1 text-sm">
                  {affectedFiles.map((file, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="font-mono text-xs">{file}</span>
                      <span className="text-gray-500">({proposalsByFile[file].length} changes)</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Repository Configuration */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Repository Configuration</h3>

              <div className="space-y-2">
                <Label htmlFor="targetRepo">Target Repository (Fork) *</Label>
                <Input
                  id="targetRepo"
                  placeholder="e.g., username/conflux-documentation-fork"
                  value={targetRepo}
                  onChange={(e) => setTargetRepo(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500">The fork where the PR will be created</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sourceRepo">Source Repository *</Label>
                <Input
                  id="sourceRepo"
                  placeholder="e.g., conflux-chain/conflux-documentation"
                  value={sourceRepo}
                  onChange={(e) => setSourceRepo(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500">The original documentation repository</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseBranch">Base Branch</Label>
                <Input
                  id="baseBranch"
                  placeholder="main"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                />
              </div>
            </div>

            {/* PR Details */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Pull Request Details</h3>

              <div className="space-y-2">
                <Label htmlFor="prTitle">PR Title *</Label>
                <Input
                  id="prTitle"
                  placeholder="e.g., docs: Update documentation based on community feedback"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prBody">PR Description *</Label>
                <Textarea
                  id="prBody"
                  placeholder="Describe the changes in this pull request..."
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  rows={6}
                  required
                />
                <p className="text-xs text-gray-500">
                  Statistics will be automatically appended to the description
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="submittedBy">Submitted By</Label>
                <Input
                  id="submittedBy"
                  placeholder="admin"
                  value={submittedBy}
                  onChange={(e) => setSubmittedBy(e.target.value)}
                />
              </div>
            </div>

            {/* Warning */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The PR will be created as a <strong>draft</strong>. Review it on GitHub before publishing.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {submitResult ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !prTitle.trim() || !targetRepo.trim() || !sourceRepo.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating PR...
                  </>
                ) : (
                  <>
                    <GitPullRequest className="w-4 h-4 mr-2" />
                    Create Draft PR
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
