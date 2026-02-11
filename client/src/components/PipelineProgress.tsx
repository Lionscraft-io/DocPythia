/**
 * Pipeline Progress Visual Component
 * Shows real-time pipeline execution with animated steps and details
 *
 * @author Wayne
 * @created 2026-02-11
 */

import { useState } from 'react';
import {
  Filter,
  Tags,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronUp,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface PipelineStep {
  stepName: string;
  stepType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs?: number;
  inputCount?: number;
  outputCount?: number;
  promptUsed?: string;
  error?: string;
}

interface PipelineProgressProps {
  isRunning: boolean;
  currentRun?: {
    id: number;
    status: string;
    steps: PipelineStep[];
    inputMessages: number;
    outputProposals?: number;
    totalDurationMs?: number;
  } | null;
  prompts?: Array<{
    id: string;
    system: string;
    user: string;
    metadata: { description: string };
  }>;
}

// Define all pipeline stages with their metadata
const PIPELINE_STAGES = [
  {
    id: 'filter',
    name: 'Filter',
    stepType: 'filter',
    icon: Filter,
    description: 'Pre-filter messages by keywords',
    promptId: null,
    color: 'blue',
  },
  {
    id: 'classify',
    name: 'Classify',
    stepType: 'classify',
    icon: Tags,
    description: 'Classify messages into threads and categories',
    promptId: 'thread-classification',
    color: 'purple',
  },
  {
    id: 'enrich',
    name: 'Enrich',
    stepType: 'enrich',
    icon: Search,
    description: 'Retrieve relevant documentation context via RAG',
    promptId: null,
    color: 'cyan',
  },
  {
    id: 'generate',
    name: 'Generate',
    stepType: 'generate',
    icon: Sparkles,
    description: 'Generate documentation update proposals',
    promptId: 'changeset-generation',
    color: 'amber',
  },
  {
    id: 'validate',
    name: 'Validate',
    stepType: 'validate',
    icon: CheckCircle2,
    description: 'Validate and reformat proposal content',
    promptId: 'content-reformat',
    color: 'green',
  },
  {
    id: 'condense',
    name: 'Condense',
    stepType: 'condense',
    icon: FileText,
    description: 'Reduce proposal length if needed',
    promptId: 'content-condense',
    color: 'rose',
  },
];

function getStepStatus(
  stageType: string,
  steps: PipelineStep[],
  isRunning: boolean
): 'pending' | 'running' | 'completed' | 'failed' | 'skipped' {
  const step = steps.find((s) => s.stepType === stageType);
  if (step) {
    return step.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  }
  // If running but step not in list yet, it might be pending or current
  if (isRunning) {
    // Find the last completed step to determine current position
    const completedSteps = steps.filter((s) => s.status === 'completed');
    const stageIndex = PIPELINE_STAGES.findIndex((s) => s.stepType === stageType);
    const lastCompletedIndex = PIPELINE_STAGES.findIndex(
      (s) => s.stepType === completedSteps[completedSteps.length - 1]?.stepType
    );

    if (stageIndex === lastCompletedIndex + 1) {
      return 'running';
    } else if (stageIndex > lastCompletedIndex + 1) {
      return 'pending';
    }
  }
  return 'pending';
}

function getStepData(stageType: string, steps: PipelineStep[]): PipelineStep | undefined {
  return steps.find((s) => s.stepType === stageType);
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function PipelineProgress({
  isRunning,
  currentRun,
  prompts,
}: PipelineProgressProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const steps = currentRun?.steps || [];
  const showProgress = isRunning || (currentRun && currentRun.status !== 'pending');

  if (!showProgress) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
        <div className="flex justify-center gap-2 mb-4">
          {PIPELINE_STAGES.map((stage, index) => (
            <div key={stage.id} className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <stage.icon className="w-5 h-5 text-gray-400" />
              </div>
              {index < PIPELINE_STAGES.length - 1 && <div className="w-8 h-0.5 bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>
        <p className="text-gray-500 text-sm">Pipeline stages will appear here when running</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="border rounded-lg bg-white overflow-hidden">
        {/* Pipeline Header */}
        <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                <span className="font-medium text-blue-700">Pipeline Running...</span>
              </>
            ) : currentRun?.status === 'completed' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="font-medium text-green-700">Pipeline Completed</span>
              </>
            ) : currentRun?.status === 'failed' ? (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="font-medium text-red-700">Pipeline Failed</span>
              </>
            ) : (
              <span className="font-medium text-gray-700">Pipeline Status</span>
            )}
          </div>
          {currentRun?.totalDurationMs && (
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Clock className="w-3 h-3" />
              {formatDuration(currentRun.totalDurationMs)}
            </div>
          )}
        </div>

        {/* Pipeline Stages */}
        <div className="p-4">
          {/* Visual Flow */}
          <div className="flex items-center justify-between mb-6">
            {PIPELINE_STAGES.map((stage, index) => {
              const status = getStepStatus(stage.stepType, steps, isRunning);
              const stepData = getStepData(stage.stepType, steps);
              const prompt = prompts?.find((p) => p.id === stage.promptId);

              return (
                <div key={stage.id} className="flex items-center flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() =>
                          setExpandedStage(expandedStage === stage.id ? null : stage.id)
                        }
                        className={cn(
                          'relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300',
                          status === 'pending' && 'bg-gray-100',
                          status === 'running' && 'bg-blue-100 ring-4 ring-blue-200 animate-pulse',
                          status === 'completed' && 'bg-green-100',
                          status === 'failed' && 'bg-red-100',
                          status === 'skipped' && 'bg-gray-100 opacity-50',
                          expandedStage === stage.id && 'ring-2 ring-blue-400'
                        )}
                      >
                        {status === 'running' ? (
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        ) : status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : status === 'failed' ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : (
                          <stage.icon
                            className={cn(
                              'w-5 h-5',
                              status === 'skipped' ? 'text-gray-400' : 'text-gray-500'
                            )}
                          />
                        )}
                        {status === 'completed' && stepData?.durationMs && (
                          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">
                            {formatDuration(stepData.durationMs)}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-medium">{stage.name}</p>
                        <p className="text-xs text-gray-400">{stage.description}</p>
                        {prompt && (
                          <div className="mt-2 pt-2 border-t border-gray-600">
                            <p className="text-xs text-gray-400 mb-1">Prompt: {stage.promptId}</p>
                            <p className="text-xs text-gray-300 line-clamp-3">
                              {prompt.system.substring(0, 150)}...
                            </p>
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>

                  {/* Connector Line */}
                  {index < PIPELINE_STAGES.length - 1 && (
                    <div className="flex-1 mx-2 relative">
                      <div
                        className={cn(
                          'h-0.5 w-full transition-all duration-500',
                          status === 'completed' ? 'bg-green-400' : 'bg-gray-200'
                        )}
                      />
                      {status === 'running' && (
                        <div className="absolute inset-0 h-0.5 bg-gradient-to-r from-blue-400 to-transparent animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Stage Labels */}
          <div className="flex items-center justify-between mb-4">
            {PIPELINE_STAGES.map((stage) => (
              <div key={`label-${stage.id}`} className="w-12 text-center">
                <span className="text-[10px] text-gray-500 font-medium">{stage.name}</span>
              </div>
            ))}
          </div>

          {/* Expanded Stage Details */}
          {expandedStage && (
            <div className="border-t pt-4 mt-2">
              {(() => {
                const stage = PIPELINE_STAGES.find((s) => s.id === expandedStage);
                const stepData = stage ? getStepData(stage.stepType, steps) : null;
                const prompt = prompts?.find((p) => p.id === stage?.promptId);

                if (!stage) return null;

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <stage.icon className="w-5 h-5 text-gray-600" />
                        <span className="font-medium">{stage.name} Step</span>
                        {stepData?.status && (
                          <Badge
                            className={cn(
                              'text-xs',
                              stepData.status === 'completed' && 'bg-green-100 text-green-800',
                              stepData.status === 'failed' && 'bg-red-100 text-red-800',
                              stepData.status === 'running' && 'bg-blue-100 text-blue-800',
                              stepData.status === 'skipped' && 'bg-gray-100 text-gray-800'
                            )}
                          >
                            {stepData.status}
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedStage(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-sm text-gray-600">{stage.description}</p>

                    {/* Input/Output Counts */}
                    {stepData &&
                      (stepData.inputCount !== undefined || stepData.outputCount !== undefined) && (
                        <div className="flex gap-4 text-sm">
                          {stepData.inputCount !== undefined && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Input:</span>
                              <span className="font-medium">{stepData.inputCount} items</span>
                            </div>
                          )}
                          {stepData.outputCount !== undefined && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Output:</span>
                              <span className="font-medium">{stepData.outputCount} items</span>
                            </div>
                          )}
                          {stepData.durationMs !== undefined && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              <span className="font-medium">
                                {formatDuration(stepData.durationMs)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Error Message */}
                    {stepData?.error && (
                      <div className="bg-red-50 border border-red-200 rounded-md p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                          <p className="text-sm text-red-700">{stepData.error}</p>
                        </div>
                      </div>
                    )}

                    {/* Prompt Preview */}
                    {prompt && (
                      <div className="bg-gray-50 rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-xs font-medium text-gray-600">
                            Prompt: {stage.promptId}
                          </span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-gray-500">System:</span>
                            <p className="text-gray-700 font-mono bg-white p-2 rounded mt-1 max-h-24 overflow-y-auto">
                              {prompt.system.substring(0, 500)}
                              {prompt.system.length > 500 && '...'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
