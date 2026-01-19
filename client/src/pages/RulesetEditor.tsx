/**
 * Ruleset Editor Page
 * Create and edit tenant-specific rulesets for proposal quality control
 *
 * @author Wayne
 * @created 2026-01-19
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { FileText, Save, ArrowLeft, AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminApiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Get instance prefix from URL (e.g., /near/admin -> /near)
function getInstancePrefix(): string {
  const pathParts = window.location.pathname.split('/');
  if (
    pathParts.length >= 2 &&
    pathParts[1] &&
    pathParts[1] !== 'admin' &&
    pathParts[1] !== 'login'
  ) {
    return `/${pathParts[1]}`;
  }
  return '';
}

// Get tenant ID from URL (e.g., /near/admin -> near)
function getTenantId(): string {
  const pathParts = window.location.pathname.split('/');
  if (
    pathParts.length >= 2 &&
    pathParts[1] &&
    pathParts[1] !== 'admin' &&
    pathParts[1] !== 'login'
  ) {
    return pathParts[1];
  }
  return 'default';
}

interface Ruleset {
  id: number;
  tenantId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_RULESET_TEMPLATE = `# Tenant Ruleset
# This ruleset defines quality control rules for proposal review

## PROMPT_CONTEXT
# Additional context provided to the LLM during proposal generation
# Use this to add project-specific terminology, preferences, or guidelines

## REVIEW_MODIFICATIONS
# Automatic modifications applied to proposals before review
# Example: Replace deprecated terminology, enforce consistent formatting

## REJECTION_RULES
# Rules that automatically reject proposals
# Example: Reject proposals containing certain keywords or patterns

## QUALITY_GATES
# Quality requirements that proposals must meet
# Example: Minimum content length, required sections
`;

export default function RulesetEditor() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const apiPrefix = getInstancePrefix();
  const tenantId = getTenantId();

  const [content, setContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch existing ruleset
  const {
    data: ruleset,
    isLoading,
    error,
  } = useQuery<Ruleset>({
    queryKey: [`${apiPrefix}/api/quality/rulesets/${tenantId}`],
    queryFn: async () => {
      try {
        const response = await adminApiRequest(
          'GET',
          `${apiPrefix}/api/quality/rulesets/${tenantId}`
        );
        return response.json();
      } catch (err) {
        // 404 is expected for new tenants
        if (err instanceof Error && err.message.includes('404')) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
  });

  // Initialize content from fetched ruleset or template
  useEffect(() => {
    if (ruleset?.content) {
      setContent(ruleset.content);
    } else if (!isLoading && !ruleset) {
      setContent(DEFAULT_RULESET_TEMPLATE);
    }
    setHasUnsavedChanges(false);
  }, [ruleset, isLoading]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newContent: string) => {
      const response = await adminApiRequest(
        'PUT',
        `${apiPrefix}/api/quality/rulesets/${tenantId}`,
        { content: newContent }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`${apiPrefix}/api/quality/rulesets/${tenantId}`],
      });
      setHasUnsavedChanges(false);
      toast({
        title: 'Ruleset saved',
        description: 'Your changes have been saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save ruleset',
        variant: 'destructive',
      });
    },
  });

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(newContent !== (ruleset?.content || DEFAULT_RULESET_TEMPLATE));
  };

  const handleSave = () => {
    saveMutation.mutate(content);
  };

  const navigateBack = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return;
      }
    }
    const basePath = apiPrefix ? `${apiPrefix}/admin` : '/admin';
    setLocation(basePath);
  };

  if (error && !(error instanceof Error && error.message.includes('404'))) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load ruleset: {error instanceof Error ? error.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={navigateBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Ruleset Editor</h1>
                <p className="text-sm text-gray-600">
                  Configure quality rules for tenant: {tenantId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  Unsaved changes
                </span>
              )}
              <Button onClick={handleSave} disabled={saveMutation.isPending || !hasUnsavedChanges}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Ruleset
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-6">
        {/* Info Alert */}
        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Ruleset Format:</strong> Use markdown headers to define sections. The system
            recognizes these sections: <code>PROMPT_CONTEXT</code>,{' '}
            <code>REVIEW_MODIFICATIONS</code>, <code>REJECTION_RULES</code>, and{' '}
            <code>QUALITY_GATES</code>.
          </AlertDescription>
        </Alert>

        {/* Status Card */}
        {ruleset && (
          <Card className="mb-6">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">
                    Ruleset exists for this tenant
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  Last updated: {new Date(ruleset.updatedAt).toLocaleString()}
                </span>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ruleset Content
            </CardTitle>
            <CardDescription>
              Edit the ruleset markdown below. Changes are applied to new proposal reviews.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="font-mono text-sm min-h-[500px] resize-y"
                placeholder="Enter your ruleset content..."
              />
            )}
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Section Reference</CardTitle>
            <CardDescription>How each section is used during proposal processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-gray-900">## PROMPT_CONTEXT</h4>
                <p className="text-gray-600 mt-1">
                  Content injected into the LLM prompt during changeset generation. Use this to
                  provide project-specific context, terminology definitions, or writing style
                  guidelines.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">## REVIEW_MODIFICATIONS</h4>
                <p className="text-gray-600 mt-1">
                  Rules for automatic text modifications. Define find/replace patterns to enforce
                  consistent terminology or formatting across all proposals.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">## REJECTION_RULES</h4>
                <p className="text-gray-600 mt-1">
                  Criteria that cause automatic proposal rejection. Define patterns or keywords that
                  indicate low-quality or inappropriate content.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">## QUALITY_GATES</h4>
                <p className="text-gray-600 mt-1">
                  Quality requirements that proposals must meet. Define minimum content length,
                  required sections, or other quality metrics.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
