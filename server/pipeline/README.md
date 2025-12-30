# Customizable Analysis Pipeline

This directory contains the customizable analysis pipeline implementation as defined in `/docs/specs/customizable-analysis-pipeline.md`.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Configuration Layer                        │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Prompt Files  │  │ Domain Defs  │  │ Pipeline Config │  │
│  │ (Markdown)    │  │ (JSON)       │  │ (JSON)          │  │
│  └───────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Filter   │→ │ Classify │→ │ Enrich   │→ │ Generate │   │
│  │ Step     │  │ Step     │  │ Step     │  │ Step     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Execution Layer                            │
│              PipelineOrchestrator + Context                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Integration Layer                           │
│    LLM Handlers  │  RAG Service  │  Database Persistence     │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
pipeline/
├── core/
│   ├── interfaces.ts          # All interface definitions
│   ├── PipelineContext.ts     # Context factory and utilities
│   ├── PipelineOrchestrator.ts # Step execution coordinator
│   └── StepFactory.ts         # Step creation factory
├── steps/
│   ├── base/
│   │   └── BasePipelineStep.ts # Abstract base class
│   ├── filter/
│   │   └── KeywordFilterStep.ts
│   ├── classify/
│   │   └── BatchClassifyStep.ts
│   ├── enrich/
│   │   └── RagEnrichStep.ts
│   └── generate/
│       └── ProposalGenerateStep.ts
├── handlers/
│   └── GeminiHandler.ts       # Gemini LLM implementation
├── prompts/
│   └── PromptRegistry.ts      # Prompt template management
├── config/
│   ├── DomainConfigLoader.ts  # Domain config loading
│   └── PipelineConfigLoader.ts # Pipeline config loading
├── index.ts                   # Module exports
└── README.md                  # This file
```

## Configuration Files

Configuration files are stored in `/config/`:

```
config/
├── defaults/
│   ├── prompts/
│   │   ├── thread-classification.md
│   │   └── changeset-generation.md
│   ├── domains/
│   │   └── generic.json
│   └── pipelines/
│       └── default.json
└── {instanceId}/
    ├── prompts/
    │   └── custom-prompt.md    # Override defaults
    ├── domains/
    │   └── validators.json     # Instance-specific domain
    └── pipelines/
        └── custom.json         # Instance-specific pipeline
```

## Usage

### Basic Usage

```typescript
import {
  PipelineOrchestrator,
  createPipelineContext,
  createPromptRegistry,
  createGeminiHandler,
  loadDomainConfig,
  loadPipelineConfig,
} from './pipeline';

// Load configuration
const domainConfig = await loadDomainConfig('./config', 'near', 'validators');
const pipelineConfig = await loadPipelineConfig('./config', 'near', 'validators');

// Create services
const llmHandler = createGeminiHandler();
const prompts = createPromptRegistry('./config', 'near');
await prompts.load();

// Create orchestrator
const orchestrator = new PipelineOrchestrator(pipelineConfig, llmHandler);

// Create context
const context = createPipelineContext({
  instanceId: 'near',
  batchId: 'batch-123',
  streamId: 'near-zulip',
  messages: [...],
  domainConfig,
  prompts,
  llmHandler,
  ragService: vectorSearch,
  db: prisma,
});

// Execute pipeline
const result = await orchestrator.execute(context);

console.log(`Processed ${result.messagesProcessed} messages`);
console.log(`Created ${result.threadsCreated} threads`);
console.log(`Generated ${result.proposalsGenerated} proposals`);
```

### Adding Custom Steps

```typescript
import { BasePipelineStep, StepType, StepFactory } from './pipeline';

class MyCustomStep extends BasePipelineStep {
  readonly stepType = StepType.TRANSFORM;

  async execute(context) {
    // Custom logic here
    return context;
  }

  getMetadata() {
    return {
      name: 'My Custom Step',
      description: 'Does something custom',
      version: '1.0.0',
    };
  }
}

// Register with factory
const factory = getStepFactory();
factory.register('custom', (config, llmHandler) => new MyCustomStep(config));
```

## Key Interfaces

### IPipelineStep

```typescript
interface IPipelineStep {
  readonly stepId: string;
  readonly stepType: StepType;
  execute(context: PipelineContext): Promise<PipelineContext>;
  validateConfig(config: StepConfig): boolean;
  getMetadata(): StepMetadata;
}
```

### ILLMHandler

```typescript
interface ILLMHandler {
  readonly name: string;
  requestJSON<T>(request: LLMRequest, schema: z.ZodSchema<T>, context: LLMContext): Promise<{ data: T; response: LLMResponse }>;
  requestText(request: LLMRequest, context: LLMContext): Promise<LLMResponse>;
  getModelInfo(model: string): ModelInfo;
  estimateCost(request: LLMRequest): CostEstimate;
}
```

### IPromptRegistry

```typescript
interface IPromptRegistry {
  get(promptId: string): PromptTemplate | null;
  render(promptId: string, variables: Record<string, unknown>): RenderedPrompt;
  list(): PromptTemplate[];
  reload(): Promise<void>;
  validate(template: PromptTemplate): ValidationResult;
}
```

## Prompt Template Format

Prompts are Markdown files with YAML frontmatter:

```markdown
---
id: my-prompt
version: "1.0.0"
metadata:
  author: Wayne
  description: My prompt description
  requiredVariables:
    - variable1
    - variable2
  tags:
    - classification
---

# System Prompt

Your system prompt here with {{variable1}} interpolation.

---

# User Prompt

Your user prompt here with {{variable2}} interpolation.
```

## Domain Configuration

```json
{
  "domainId": "my-domain",
  "name": "My Domain",
  "categories": [
    {
      "id": "category-id",
      "label": "Category Label",
      "description": "Category description",
      "priority": 90
    }
  ],
  "keywords": {
    "include": ["keyword1", "keyword2"],
    "exclude": ["spam"]
  },
  "ragPaths": {
    "include": ["docs/**"],
    "exclude": ["i18n/**"]
  },
  "context": {
    "projectName": "My Project",
    "domain": "My Domain",
    "targetAudience": "Developers",
    "documentationPurpose": "Technical documentation"
  }
}
```

## Testing

Tests are located in `/tests/`:

- `tests/pipeline-steps.test.ts` - Unit tests for pipeline steps
- `tests/pipeline-config.test.ts` - Unit tests for configuration loaders
- `tests/pipeline-integration.test.ts` - Integration tests
- `tests/pipeline-e2e.test.ts` - End-to-end tests

```bash
# Run all pipeline tests
npm test -- tests/pipeline-steps.test.ts tests/pipeline-config.test.ts tests/pipeline-integration.test.ts tests/pipeline-e2e.test.ts

# Or run individually
npm test -- tests/pipeline-steps.test.ts
```

## Author

Wayne - 2025-12-30
