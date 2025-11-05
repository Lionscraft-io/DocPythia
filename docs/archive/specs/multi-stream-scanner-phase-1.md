# Spec: Multi-Stream Message Scanner - Phase 1: Batch Analysis & Proposals

**Developer:** Wayne
**Created:** 2025-10-30
**Updated:** 2025-11-04
**Status:** Implemented ✅
**Phase:** 1 of 2
**Story:** [/docs/stories/multi-stream-message-scanner.md](/docs/stories/multi-stream-message-scanner.md)

**Implementation Complete:** All Phase 1 features are live in production.
- ✅ Dual watermark system (import + processing)
- ✅ Batch classification with contextual analysis
- ✅ LLM message classification
- ✅ Documentation proposal generation
- ✅ Telegram and CSV adapters functional

## Overview

Phase 1 implements a dual-watermark message streaming system with batch classification and documentation proposal generation. Messages are imported continuously from multiple sources, then processed in 24-hour batches with contextual awareness. The LLM analyzes entire conversation flows to identify messages with documentation value, then generates proposals individually for each relevant message.

**Key Features:**
- **Dual Watermark System**: Separate tracking for import and processing progress
- **Batch Classification**: Process 24-hour blocks of messages with 24 hours of context
- **Contextual Analysis**: LLM sees conversation flow, not isolated messages
- **Efficient Processing**: One classification per batch, individual proposals for relevant messages
- **No Manual Review Required**: Proposals go directly to admin dashboard for approval

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Stream Manager                            │
│  - Manages stream adapters                                   │
│  - Tracks dual watermarks (import + processing)              │
│  - Schedules 24-hour batch processing                        │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┬─────────────┬──────────────┐
        ▼                         ▼             ▼              ▼
┌──────────────┐      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Telegram   │      │   Discord    │ │   File/CSV   │ │    Slack     │
│   Adapter    │      │   Adapter    │ │   Adapter    │ │   Adapter    │
│              │      │              │ │              │ │              │
│  Import WM:  │      │  Import WM:  │ │  Import WM:  │ │  Import WM:  │
│  2025-10-31  │      │  2025-10-31  │ │  file_123    │ │  2025-10-30  │
└──────┬───────┘      └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                     │                 │                 │
       └─────────────────────┴─────────────────┴─────────────────┘
                                       │
                             ┌─────────▼──────────┐
                             │  Unified Messages  │
                             │  Storage           │
                             │  - All messages    │
                             │  - Timestamped     │
                             │  - Embeddings      │
                             └─────────┬──────────┘
                                       │
                             ┌─────────▼──────────┐
                             │  Processing WM:    │
                             │  2025-10-29        │
                             └─────────┬──────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  │  24-Hour Batch Selector                  │
                  │  Context: 2025-10-28 → 2025-10-29       │
                  │  Process: 2025-10-29 → 2025-10-30       │
                  └────────────────────┬─────────────────────┘
                                       │
                             ┌─────────▼──────────┐
                             │  Batch             │
                             │  Classification    │
                             │  (LLM-1)           │
                             │  - All messages    │
                             │  - Identify value  │
                             └─────────┬──────────┘
                                       │
                             ┌─────────▼──────────┐
                             │  For Each Message  │
                             │  with Doc Value:   │
                             └─────────┬──────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  │                                          │
                  ▼                                          ▼
        ┌──────────────────┐                    ┌──────────────────┐
        │  RAG Retrieval   │                    │  Generate        │
        │  - Doc search    │───────────────────>│  Proposal        │
        │  - Similar docs  │                    │  (LLM-2)         │
        └──────────────────┘                    └─────────┬────────┘
                                                          │
                                                ┌─────────▼──────────┐
                                                │  Store Proposal    │
                                                │  → Admin Dashboard │
                                                └────────────────────┘
```

## Processing Pipeline

### 1. Stream Intake and Normalization (Continuous Import)

**Goal**: Continuously import all available messages from sources.

**Import Watermark**: Tracks what has been imported from each source (per channel/file).

Each adapter:
- Polls its source using **import watermark** tracking
- Imports ALL available messages up to current time (or end of file)
- Normalizes messages into `UnifiedMessage` format
- Generates and stores embeddings for future RAG
- Inserts into `unified_messages` table
- Updates **import watermark** for the source

**Import Watermark Schema:**
```typescript
{
  streamId: string;           // e.g., "telegram-near-chat"
  streamType: string;          // "telegram", "discord", "csv", etc.
  resourceId?: string;         // channel ID or file name
  lastImportedTime: Date;      // Latest message timestamp imported
  lastImportedId?: string;     // Latest message ID imported
  updatedAt: Date;
}
```

**Examples:**
- Telegram channel: Import all messages up to "now"
- CSV file: Import entire file, mark file as complete
- Discord channel: Import all available messages

No LLM involvement at this stage. Messages are stored and ready for processing.

### 2. Batch Selection (Processing Window)

**Goal**: Select a 24-hour block of messages with 24 hours of context.

**Processing Watermark**: Tracks what has been analyzed for documentation value.

**Process:**
1. Check current processing watermark (e.g., 2025-10-29 00:00:00)
2. Select messages in two windows:
   - **Context Window**: 24 hours BEFORE processing watermark
     - `WHERE timestamp >= processingWM - 24h AND timestamp < processingWM`
     - Used for conversation context only
   - **Processing Window**: 24 hours FROM processing watermark
     - `WHERE timestamp >= processingWM AND timestamp < processingWM + 24h`
     - These messages will be analyzed for doc value

**Processing Watermark Schema:**
```typescript
{
  watermarkTime: Date;         // Current processing position
  lastProcessedBatch: Date;    // End time of last processed batch
  updatedAt: Date;
}
```

**Sequential Processing**: Only one 24-hour batch processed at a time. Next batch starts after previous completes.

### 3. Batch Classification (LLM-1)

**Goal**: Analyze entire 24-hour conversation to identify messages with documentation value.

**Inputs**:
- **Context messages**: Previous 24 hours (for conversation flow)
- **Processing messages**: Current 24 hours (to analyze)
- Documentation index
- Project configuration

**Process**:
- Send ALL messages from both windows to LLM in chronological order
- Mark which messages are context vs. processing window
- LLM analyzes conversation flow and identifies messages with doc value
- Returns structured list of message IDs with doc value
- Store results in `message_classification` table (one row per identified message)

**Prompt Structure:**
```
Context Messages (for reference, 2025-10-28 to 2025-10-29):
[List of 100+ messages with timestamps and authors]

Messages to Analyze (2025-10-29 to 2025-10-30):
[List of 50+ messages with timestamps and authors]

Task: From the "Messages to Analyze" section, identify which messages provide information that should be documented. Consider the context messages to understand the conversation flow.
```

**Output**:
```json
{
  "messages_with_doc_value": [
    {
      "message_id": "123",
      "category": "information|troubleshooting|update|announcement",
      "doc_value_reason": "Explains new API endpoint behavior",
      "suggested_doc_page": "api/authentication.md",
      "rag_search_criteria": ["authentication", "API", "token"]
    },
    {
      "message_id": "456",
      "category": "troubleshooting",
      "doc_value_reason": "Common database connection error solution",
      "suggested_doc_page": "troubleshooting/database.md",
      "rag_search_criteria": ["database", "connection", "postgres"]
    }
  ],
  "total_analyzed": 52,
  "messages_with_value": 2,
  "context_used": 98
}
```

**Benefits of Batch Approach:**
- LLM sees conversation context (questions, answers, follow-ups)
- More efficient: 1 LLM call instead of 50+
- Better accuracy: Can distinguish important info from casual chat
- Natural: Mimics how humans review chat logs

### 4. RAG Retrieval (Per Message)

**Goal**: Find relevant documentation for each message with doc value.

**Process** (for each identified message):
- Use `rag_search_criteria` from classification
- Retrieve top 5 most relevant documentation chunks
- Use existing vector store and embedding search
- No need to search similar messages (we have context from batch)

**Output**:
```json
{
  "message_id": "123",
  "retrieved_docs": [{
    "doc_id": "uuid",
    "title": "Authentication API",
    "content": "...",
    "similarity": 0.95,
    "file_path": "api/authentication.md"
  }],
  "total_tokens": 2500
}
```

### 5. Documentation Proposal Generation (LLM-2)

**Goal**: Generate specific documentation update proposal for each valuable message.

**Inputs** (per message):
- Message content
- Conversation context (from batch)
- Retrieved documentation chunks (from RAG)
- Classification metadata (category, suggested page, reasoning)
- Style guide

**Process**:
- Compare message info with existing docs
- Identify target page and section
- Generate specific edit proposal
- Provide confidence score and reasoning
- Store in `doc_proposals` table

**Output**:
```json
{
  "message_id": "123",
  "page": "api/authentication.md",
  "update_type": "INSERT|UPDATE|DELETE|NONE",
  "section": "Token Expiration",
  "location": {
    "after_heading": "Token Expiration",
    "character_range": [1250, 1450]
  },
  "suggested_text": "Tokens expire after 24 hours of inactivity. Active tokens refresh automatically on each request.",
  "confidence": 0.85,
  "reasoning": "User reported confusion about token expiration behavior. This clarifies the auto-refresh mechanism.",
  "source_conversation": ["msg-122", "msg-123", "msg-124"]
}
```

**No Review Step**: Proposals go directly to admin dashboard for human approval. No automated LLM review needed.

## LLM Configuration & Prompts

### Project Configuration (`server/config/llm-context.ts`)

```typescript
export interface DocumentationIndex {
  pages: Array<{
    title: string;
    path: string;
    sections: string[];
    summary: string;
    last_updated: Date;
  }>;
  categories: Record<string, string[]>; // category -> page paths
  generated_at: Date;
}

export interface ProjectContext {
  project_name: string;
  project_description: string;
  doc_purpose: string;
  target_audience: string;
  style_guide: string;
  doc_index: DocumentationIndex;
}

// Loaded from environment or config file
export const projectContext: ProjectContext = {
  project_name: process.env.PROJECT_NAME || "NearDocsAI",
  project_description: process.env.PROJECT_DESCRIPTION || "AI-powered documentation management system",
  doc_purpose: process.env.DOC_PURPOSE || "Technical documentation for developers",
  target_audience: process.env.TARGET_AUDIENCE || "Developers, DevOps engineers",
  style_guide: process.env.STYLE_GUIDE || "Clear, concise, technical writing",
  doc_index: await loadDocumentationIndex() // Generated automatically
};
```

### Batch Classification Prompt (LLM-1)

```typescript
const batchClassificationPrompt = `
You are a documentation expert reviewing 24 hours of community conversations about {project_name}.
Description: {project_description}
Purpose of documentation: {doc_purpose}
Target audience: {target_audience}

Documentation Index:
{doc_index}

CONTEXT MESSAGES (previous 24 hours, for reference only):
{context_messages}

MESSAGES TO ANALYZE (current 24 hours):
{processing_messages}

Task:
Review all messages in the "MESSAGES TO ANALYZE" section. Use the context messages to understand conversation flow, but only identify valuable messages from the "MESSAGES TO ANALYZE" section.

For each message that provides lasting documentation value, include it in your response with:
1. Message ID (from the list)
2. Category: information | troubleshooting | update | announcement | tutorial | question_with_answer
3. Brief reason why it has documentation value
4. Suggested documentation page (if obvious)
5. Search criteria terms for RAG retrieval (3-6 terms)

Respond with valid JSON only:
{
  "messages_with_doc_value": [
    {
      "message_id": "msg-123",
      "category": "troubleshooting",
      "doc_value_reason": "Explains solution to common database connection error",
      "suggested_doc_page": "troubleshooting/database.md",
      "rag_search_criteria": ["database", "connection", "postgres", "error", "timeout"]
    }
  ],
  "total_analyzed": 52,
  "messages_with_value": 1,
  "context_used": 98
}

Rules:
- Focus on timeless, factual information
- Prefer messages from moderators/admins
- Include Q&A pairs where the answer is valuable
- Ignore: greetings, jokes, off-topic chat, temporary info
- Include: bug solutions, feature explanations, best practices, policy updates
- Consider conversation flow: a question alone may not be valuable, but question + answer is
`;

// Format messages for batch prompt
function buildBatchClassificationPrompt(
  contextMessages: UnifiedMessage[],
  processingMessages: UnifiedMessage[],
  context: ProjectContext
): string {
  const formattedIndex = docIndexGenerator.formatForPrompt(context.doc_index);

  const formatMessages = (messages: UnifiedMessage[]) => {
    return messages.map((msg, idx) =>
      `[${idx + 1}] ${msg.timestamp.toISOString()} | ${msg.author}${msg.metadata?.is_admin ? ' (ADMIN)' : ''}\n` +
      `    ID: ${msg.messageId}\n` +
      `    ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`
    ).join('\n\n');
  };

  return batchClassificationPrompt
    .replace('{project_name}', context.project_name)
    .replace('{project_description}', context.project_description)
    .replace('{doc_purpose}', context.doc_purpose)
    .replace('{target_audience}', context.target_audience)
    .replace('{doc_index}', formattedIndex)
    .replace('{context_messages}', formatMessages(contextMessages))
    .replace('{processing_messages}', formatMessages(processingMessages));
}
```

**Example formatted doc_index:**
```
Documentation Index (147 pages):

Getting Started:
  - Quick Start Guide (getting-started/quickstart.md)
    Sections: Installation, First Steps, Configuration, Next Steps
  - Developer Setup (getting-started/dev-setup.md)
    Sections: Prerequisites, Environment Variables, Database Setup

API Reference:
  - Authentication API (api/authentication.md)
    Sections: Overview, Endpoints, Request Format, Response Format, Error Codes
  - Validators API (api/validators.md)
    Sections: List Validators, Query Validator Details, Staking Operations
...
```

### Documentation Update Prompt (LLM-2)

```typescript
const updatePrompt = `
You are an expert documentation editor.
Analyze a new community message and decide what change to make to the documentation.

Inputs:
Message:
""" {post_content} """

Related documentation (from RAG):
[{title}: {content_excerpt}, ...]

Related past posts (if any):
[{date}: {post_excerpt}, ...]

Documentation style guide:
{style_information}

Task:
1. Determine if this information should update documentation.
2. Check for conflicts or outdated info.
3. Identify the target page/section.
4. Propose an edit (INSERT, UPDATE, or DELETE).
5. Give your confidence (0–1) and reasoning.

Respond in JSON:
{
  "page": "{page_title_or_null}",
  "update_type": "INSERT|UPDATE|DELETE|NONE",
  "section": "{section_or_null}",
  "character_range": [start,end],
  "suggested_text": "{proposed_text_or_null}",
  "confidence": 0.0-1.0,
  "reasoning": "{short_reason}"
}

Rules:
- Follow provided style.
- Prefer minimal clear edits over rewriting.
- Exclude humor or irrelevant remarks.
`;
```

## Database Schema

### Watermark Tables

```sql
-- Import watermarks (per stream/channel/file)
CREATE TABLE import_watermarks (
  id SERIAL PRIMARY KEY,
  stream_id VARCHAR(255) NOT NULL,        -- e.g., "telegram-near-chat"
  stream_type VARCHAR(50) NOT NULL,       -- "telegram", "discord", "csv", etc.
  resource_id VARCHAR(255),               -- channel ID or file name
  last_imported_time TIMESTAMP,           -- Latest message timestamp imported
  last_imported_id VARCHAR(255),          -- Latest message ID imported
  import_complete BOOLEAN DEFAULT FALSE,  -- For CSV files: marks file as fully processed
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(stream_id, resource_id)
);

-- Processing watermark (global, single row)
CREATE TABLE processing_watermark (
  id INTEGER PRIMARY KEY DEFAULT 1,      -- Only one row allowed
  watermark_time TIMESTAMP NOT NULL,     -- Current processing position
  last_processed_batch TIMESTAMP,        -- End time of last processed batch
  updated_at TIMESTAMP DEFAULT NOW(),
  CHECK (id = 1)                         -- Enforce single row
);

-- Initialize processing watermark
INSERT INTO processing_watermark (watermark_time, last_processed_batch)
VALUES (NOW() - INTERVAL '7 days', NULL)
ON CONFLICT (id) DO NOTHING;
```

### Message Tables

```sql
-- Message classification results (from batch analysis)
CREATE TABLE message_classification (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES unified_messages(id) UNIQUE,
  batch_id VARCHAR(50),                   -- Links messages from same batch
  category VARCHAR(50) NOT NULL,          -- information, troubleshooting, update, etc.
  doc_value_reason TEXT NOT NULL,         -- Why this message has value
  suggested_doc_page VARCHAR(255),        -- Suggested target page
  rag_search_criteria JSONB,              -- Search terms for RAG retrieval
  model_used VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- RAG retrieval results (per message)
CREATE TABLE message_rag_context (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES unified_messages(id) UNIQUE,
  retrieved_docs JSONB NOT NULL,          -- Array of {doc_id, title, content, similarity, file_path}
  total_tokens INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Documentation update proposals (per message)
CREATE TABLE doc_proposals (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES unified_messages(id),
  page VARCHAR(255),
  update_type VARCHAR(20) NOT NULL,       -- INSERT|UPDATE|DELETE|NONE
  section VARCHAR(255),
  location JSONB,                         -- {after_heading, character_range}
  suggested_text TEXT,
  confidence DECIMAL(3,2) NOT NULL,
  reasoning TEXT,
  source_conversation JSONB,              -- Array of related message IDs
  model_used VARCHAR(50),
  admin_approved BOOLEAN DEFAULT FALSE,   -- Manual approval from dashboard
  admin_reviewed_at TIMESTAMP,
  admin_reviewed_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Admin Views

```sql
-- Admin display view (materialized)
CREATE MATERIALIZED VIEW admin_message_analysis AS
SELECT
  um.id,
  um.stream_id,
  um.message_id,
  um.timestamp,
  um.author,
  um.content,
  um.channel,
  mc.category,
  mc.doc_value_reason,
  mc.suggested_doc_page,
  mc.batch_id,
  dp.page as proposed_page,
  dp.update_type,
  dp.suggested_text,
  dp.confidence as proposal_confidence,
  dp.admin_approved,
  dp.admin_reviewed_at,
  dp.admin_reviewed_by,
  COALESCE(jsonb_array_length(mrc.retrieved_docs), 0) as rag_docs_count,
  um.created_at
FROM unified_messages um
INNER JOIN message_classification mc ON mc.message_id = um.id
LEFT JOIN doc_proposals dp ON dp.message_id = um.id
LEFT JOIN message_rag_context mrc ON mrc.message_id = um.id
ORDER BY um.created_at DESC;

-- Indexes for fast queries
CREATE INDEX idx_classification_batch ON message_classification(batch_id);
CREATE INDEX idx_classification_message ON message_classification(message_id);
CREATE INDEX idx_proposals_approved ON doc_proposals(admin_approved);
CREATE INDEX idx_proposals_message ON doc_proposals(message_id);
CREATE INDEX idx_messages_timestamp ON unified_messages(timestamp);
CREATE INDEX idx_import_watermarks_stream ON import_watermarks(stream_id, resource_id);
```

## Admin Interface

### Message Analysis Dashboard (`/admin/analysis`)

Display table showing all messages with documentation value:

| Column | Description |
|--------|-------------|
| Timestamp | When message was received |
| Batch | Which 24-hour batch this came from |
| Stream | Source (Telegram, Discord, CSV, etc.) |
| Author | Message sender |
| Content | Message text (truncated) |
| Category | Classification (troubleshooting, information, update, etc.) |
| Doc Value Reason | Why this message has documentation value |
| Suggested Page | Recommended documentation page |
| Proposed Update | Page, section, and update type |
| Confidence | LLM confidence (0-100%) |
| Admin Status | Pending / Approved / Rejected |
| RAG Docs | Count of retrieved documentation chunks |
| Actions | View full details, Approve, Reject |

### Filters

- Stream source
- Date range
- Batch ID
- Category
- Admin approval status (Pending/Approved/Rejected)
- Confidence threshold
- Suggested documentation page

### API Endpoints

```typescript
// Get messages with doc value (paginated)
GET /api/admin/stream/messages?docValue=true&page=1&limit=50&stream=telegram

// Get detailed analysis for a message
GET /api/admin/stream/messages/:messageId/details

// Approve a proposal
POST /api/admin/stream/proposals/:proposalId/approve
{
  "reviewed_by": "admin_user"
}

// Reject a proposal
POST /api/admin/stream/proposals/:proposalId/reject
{
  "reviewed_by": "admin_user",
  "reason": "Outdated information"
}

// Get batch summary
GET /api/admin/stream/batches/:batchId

// Trigger processing of next batch
POST /api/admin/stream/process-batch

// Get watermark status
GET /api/admin/stream/watermarks

// Export analysis results
GET /api/admin/stream/export?format=csv&date_from=2025-01-01
```

## Implementation Components

### 1. Stream Adapter Base Class

```typescript
export abstract class StreamAdapter {
  protected streamId: string;
  protected config: Record<string, any>;

  abstract async connect(): Promise<void>;
  abstract async disconnect(): Promise<void>;
  abstract async fetchMessages(watermark: StreamWatermark, limit?: number): Promise<UnifiedMessage[]>;
  abstract async validateConfig(): Promise<boolean>;

  protected async processMessageWithRAG(message: UnifiedMessage): Promise<void> {
    // Generate embedding for incoming message
    const embedding = await geminiEmbedder.embedText(message.content);

    // Store message with embedding for future RAG retrieval
    await vectorStore.upsertDocument({
      filePath: `messages/${message.streamId}/${message.messageId}`,
      title: `${message.author} - ${message.timestamp}`,
      content: message.content,
      gitHash: message.messageId,
      gitUrl: message.streamId,
      embedding
    });
  }
}
```

### 2. CSV File Adapter Implementation

```typescript
import { parse } from 'csv-parse/sync';
import * as path from 'path';
import * as fs from 'fs/promises';

export class CsvFileAdapter extends StreamAdapter {
  private inboxDir: string;
  private processedDir: string;
  private errorDir: string;

  constructor(streamId: string, config: {
    inboxDirectory: string;      // e.g., '/var/data/csv-inbox'
    processedDirectory: string;   // e.g., '/var/data/csv-processed'
    errorDirectory: string;       // e.g., '/var/data/csv-error'
    columnMapping: {
      date: string;               // Column name for date, e.g., 'timestamp'
      message: string;            // Column name for message content
      author?: string;            // Optional author column
      messageId?: string;         // Optional message ID column
      metadata?: string[];        // Additional columns to include as metadata
    };
  }) {
    super();
    this.streamId = streamId;
    this.config = config;
    this.inboxDir = config.inboxDirectory;
    this.processedDir = config.processedDirectory;
    this.errorDir = config.errorDirectory;
  }

  async connect(): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.inboxDir, { recursive: true });
    await fs.mkdir(this.processedDir, { recursive: true });
    await fs.mkdir(this.errorDir, { recursive: true });
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close
  }

  async fetchMessages(watermark: StreamWatermark, limit: number = 100): Promise<UnifiedMessage[]> {
    const messages: UnifiedMessage[] = [];
    const files = await this.getInboxFiles();

    for (const file of files) {
      const filePath = path.join(this.inboxDir, file);

      try {
        // Read and parse CSV file
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          cast: true,
          cast_date: true
        });

        // Process each record
        let processedCount = 0;
        for (const record of records) {
          const message = this.normalizeRecord(record, file);

          // Check watermark (skip if already processed)
          if (this.isAfterWatermark(message, watermark)) {
            messages.push(message);
            processedCount++;

            // Store message with embedding for RAG
            await this.processMessageWithRAG(message);

            if (messages.length >= limit) break;
          }
        }

        // Generate processing report
        const report = {
          fileName: file,
          totalRecords: records.length,
          processedRecords: processedCount,
          skippedRecords: records.length - processedCount,
          processingTime: new Date().toISOString(),
          watermark: watermark
        };

        // Move file to processed directory with report
        await this.moveToProcessed(filePath, report);

      } catch (error) {
        // Move problematic file to error directory with error details
        await this.moveToError(filePath, error);
        console.error(`Error processing file ${file}:`, error);
      }

      if (messages.length >= limit) break;
    }

    return messages;
  }

  private async getInboxFiles(): Promise<string[]> {
    const files = await fs.readdir(this.inboxDir);
    return files
      .filter(f => f.endsWith('.csv'))
      .sort(); // Process files in alphabetical order for consistency
  }

  private normalizeRecord(record: Record<string, any>, fileName: string): UnifiedMessage {
    const { columnMapping } = this.config;

    // Extract date and message (required fields)
    const dateValue = record[columnMapping.date];
    const messageContent = record[columnMapping.message];

    if (!dateValue || !messageContent) {
      throw new Error(`Missing required fields in record: ${JSON.stringify(record)}`);
    }

    // Parse date
    const timestamp = new Date(dateValue);
    if (isNaN(timestamp.getTime())) {
      throw new Error(`Invalid date format: ${dateValue}`);
    }

    // Extract optional fields
    const author = columnMapping.author ?
      record[columnMapping.author] || 'CSV Import' :
      'CSV Import';

    const messageId = columnMapping.messageId ?
      record[columnMapping.messageId] :
      `${fileName}_${timestamp.getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract metadata fields
    const metadata: Record<string, any> = { sourceFile: fileName };
    if (columnMapping.metadata) {
      for (const field of columnMapping.metadata) {
        if (record[field] !== undefined) {
          metadata[field] = record[field];
        }
      }
    }

    return {
      id: null, // Will be assigned by database
      streamId: this.streamId,
      messageId,
      timestamp,
      author,
      content: String(messageContent),
      rawData: record,
      metadata
    };
  }

  private isAfterWatermark(message: UnifiedMessage, watermark: StreamWatermark): boolean {
    if (!watermark.lastProcessedTime) {
      return true; // No watermark, process all
    }

    // Check timestamp first
    if (message.timestamp <= watermark.lastProcessedTime) {
      return false;
    }

    // If timestamps match exactly, check message ID
    if (message.timestamp.getTime() === watermark.lastProcessedTime.getTime() &&
        watermark.lastProcessedId &&
        message.messageId <= watermark.lastProcessedId) {
      return false;
    }

    return true;
  }

  private async moveToProcessed(filePath: string, report: any): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const processedFileName = `${timestamp}_${fileName}`;
    const processedPath = path.join(this.processedDir, processedFileName);
    const reportPath = path.join(this.processedDir, `${timestamp}_${fileName}.report.json`);

    // Move file to processed directory
    await fs.rename(filePath, processedPath);

    // Write processing report
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  private async moveToError(filePath: string, error: any): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const errorFileName = `${timestamp}_${fileName}`;
    const errorPath = path.join(this.errorDir, errorFileName);
    const errorReportPath = path.join(this.errorDir, `${timestamp}_${fileName}.error.json`);

    // Move file to error directory
    await fs.rename(filePath, errorPath);

    // Write error report
    await fs.writeFile(errorReportPath, JSON.stringify({
      fileName,
      error: error.message || String(error),
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2));
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Check directory access
      await fs.access(this.inboxDir, fs.constants.R_OK | fs.constants.W_OK);
      await fs.access(this.processedDir, fs.constants.W_OK);
      await fs.access(this.errorDir, fs.constants.W_OK);

      // Validate column mapping
      const { columnMapping } = this.config;
      if (!columnMapping.date || !columnMapping.message) {
        throw new Error('Missing required column mappings: date and message');
      }

      return true;
    } catch (error) {
      console.error('CSV adapter configuration validation failed:', error);
      return false;
    }
  }
}
```

### Configuration Example

```yaml
# config/streams/csv-historical.yaml
streamId: csv-historical
adapter: CsvFileAdapter
config:
  inboxDirectory: /var/data/csv-inbox
  processedDirectory: /var/data/csv-processed
  errorDirectory: /var/data/csv-error
  columnMapping:
    date: timestamp         # Required: column containing date/time
    message: content        # Required: column containing message text
    author: user_name       # Optional: column containing author name
    messageId: msg_id       # Optional: column containing unique ID
    metadata:              # Optional: additional columns to capture
      - channel
      - team
      - priority
  schedule: "*/5 * * * *"  # Check inbox every 5 minutes
```

### 3. Documentation Index Generator

The documentation index provides LLMs with a comprehensive overview of available documentation, enabling more accurate message classification and update detection.

```typescript
import { prisma } from '../db';
import * as fs from 'fs/promises';
import * as path from 'path';

export class DocumentationIndexGenerator {
  private cacheFile = '/tmp/doc-index-cache.json';
  private cacheTTL = 3600000; // 1 hour

  /**
   * Generates documentation index from vector store
   * Called automatically on startup and after doc syncs
   */
  async generateIndex(): Promise<DocumentationIndex> {
    // Check cache first
    const cached = await this.loadFromCache();
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Fetch all documentation pages from vector store
    const pages = await prisma.documentPages.findMany({
      select: {
        id: true,
        title: true,
        filePath: true,
        content: true,
        gitUrl: true,
        updatedAt: true
      },
      orderBy: [
        { filePath: 'asc' }
      ]
    });

    // Extract sections from each page (markdown headers)
    const indexPages = await Promise.all(
      pages.map(async (page) => ({
        title: page.title,
        path: page.filePath,
        sections: this.extractSections(page.content),
        summary: this.generateSummary(page.content),
        last_updated: page.updatedAt
      }))
    );

    // Categorize pages by topic using simple heuristics
    const categories = this.categorizePages(indexPages);

    const index: DocumentationIndex = {
      pages: indexPages,
      categories,
      generated_at: new Date()
    };

    // Cache for performance
    await this.saveToCache(index);

    return index;
  }

  /**
   * Extract markdown headers as sections
   */
  private extractSections(content: string): string[] {
    const headerRegex = /^#{1,3}\s+(.+)$/gm;
    const sections: string[] = [];
    let match;

    while ((match = headerRegex.exec(content)) !== null) {
      sections.push(match[1].trim());
    }

    return sections;
  }

  /**
   * Generate brief summary (first 200 chars or first paragraph)
   */
  private generateSummary(content: string): string {
    // Remove markdown syntax for cleaner summary
    const cleaned = content
      .replace(/^#{1,6}\s+/gm, '') // Remove headers
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links
      .replace(/[*_`]/g, '') // Remove formatting
      .trim();

    // Get first paragraph or 200 chars
    const firstPara = cleaned.split('\n\n')[0];
    return firstPara.length > 200
      ? firstPara.substring(0, 197) + '...'
      : firstPara;
  }

  /**
   * Simple category detection based on file paths
   */
  private categorizePages(pages: DocumentationIndex['pages']): Record<string, string[]> {
    const categories: Record<string, string[]> = {};

    pages.forEach((page) => {
      const pathParts = page.path.split('/');

      // Use directory name as category, or "root" for top-level docs
      const category = pathParts.length > 1
        ? pathParts[0].replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())
        : 'Root';

      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(page.path);
    });

    return categories;
  }

  /**
   * Format index as string for LLM prompts
   */
  formatForPrompt(index: DocumentationIndex): string {
    let output = `Documentation Index (${index.pages.length} pages):\n\n`;

    // Group by category
    for (const [category, paths] of Object.entries(index.categories)) {
      output += `${category}:\n`;

      const categoryPages = index.pages.filter(p => paths.includes(p.path));
      for (const page of categoryPages) {
        output += `  - ${page.title} (${page.path})\n`;
        if (page.sections.length > 0) {
          output += `    Sections: ${page.sections.slice(0, 5).join(', ')}${page.sections.length > 5 ? '...' : ''}\n`;
        }
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Cache management
   */
  private async loadFromCache(): Promise<DocumentationIndex | null> {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async saveToCache(index: DocumentationIndex): Promise<void> {
    await fs.writeFile(this.cacheFile, JSON.stringify(index, null, 2));
  }

  private isCacheValid(index: DocumentationIndex): boolean {
    const age = Date.now() - new Date(index.generated_at).getTime();
    return age < this.cacheTTL;
  }

  /**
   * Invalidate cache after doc syncs
   */
  async invalidateCache(): Promise<void> {
    try {
      await fs.unlink(this.cacheFile);
    } catch {
      // Cache file doesn't exist, that's fine
    }
  }
}

// Export singleton instance
export const docIndexGenerator = new DocumentationIndexGenerator();

/**
 * Load documentation index for LLM context
 */
export async function loadDocumentationIndex(): Promise<DocumentationIndex> {
  return await docIndexGenerator.generateIndex();
}
```

### Integration with Git Sync

The documentation index should be regenerated automatically after documentation syncs:

```typescript
// In server/git-fetcher.ts or documentation sync handler
import { docIndexGenerator } from './config/doc-index-generator';

async function syncDocumentation() {
  // ... existing sync logic ...

  // After successful sync, regenerate index
  await docIndexGenerator.invalidateCache();
  const newIndex = await docIndexGenerator.generateIndex();

  console.log(`Documentation index updated: ${newIndex.pages.length} pages`);
}
```

### 4. Batch Message Processor Pipeline

```typescript
export class BatchMessageProcessor {
  /**
   * Process a 24-hour batch of messages
   */
  async processBatch(): Promise<ProcessingResult> {
    // Step 1: Get processing watermark
    const watermark = await this.getProcessingWatermark();

    // Step 2: Select messages in processing window (24h) with context (previous 24h)
    const contextStart = new Date(watermark.getTime() - 24 * 60 * 60 * 1000);
    const contextEnd = watermark;
    const processingStart = watermark;
    const processingEnd = new Date(watermark.getTime() + 24 * 60 * 60 * 1000);

    const contextMessages = await this.getMessages(contextStart, contextEnd);
    const processingMessages = await this.getMessages(processingStart, processingEnd);

    if (processingMessages.length === 0) {
      console.log('No messages to process in this batch');
      return { processedCount: 0, messagesWithValue: 0 };
    }

    // Step 3: Batch classification (single LLM call)
    const batchId = `batch-${processingStart.toISOString()}`;
    const classification = await this.classifyBatch(
      contextMessages,
      processingMessages,
      batchId
    );

    console.log(`Batch ${batchId}: ${classification.messages_with_value} of ${classification.total_analyzed} messages have doc value`);

    // Step 4: For each message with doc value, generate proposal
    for (const messageClass of classification.messages_with_doc_value) {
      const message = processingMessages.find(m => m.messageId === messageClass.message_id);
      if (!message) continue;

      // RAG retrieval
      const ragContext = await this.retrieveContext(
        message.content,
        messageClass.rag_search_criteria
      );

      // Generate proposal
      const proposal = await this.generateProposal(
        message,
        messageClass,
        ragContext,
        { contextMessages, processingMessages } // Full conversation context
      );

      // Store proposal (goes directly to admin dashboard)
      await this.storeProposal(message.id, proposal);
    }

    // Step 5: Update processing watermark
    await this.updateProcessingWatermark(processingEnd);

    // Step 6: Refresh admin view
    await this.refreshAdminView();

    return {
      processedCount: processingMessages.length,
      messagesWithValue: classification.messages_with_value,
      batchId
    };
  }

  private async classifyBatch(
    contextMessages: UnifiedMessage[],
    processingMessages: UnifiedMessage[],
    batchId: string
  ): Promise<BatchClassificationResult> {
    const prompt = buildBatchClassificationPrompt(
      contextMessages,
      processingMessages,
      projectContext
    );

    const response = await this.llmClient.generate(prompt, 'medium');
    const result = JSON.parse(response);

    // Store classification for each identified message
    for (const msgClass of result.messages_with_doc_value) {
      const message = processingMessages.find(m => m.messageId === msgClass.message_id);
      if (message) {
        await prisma.messageClassification.create({
          data: {
            messageId: message.id,
            batchId,
            category: msgClass.category,
            docValueReason: msgClass.doc_value_reason,
            suggestedDocPage: msgClass.suggested_doc_page,
            ragSearchCriteria: msgClass.rag_search_criteria,
            modelUsed: 'gemini-1.5-pro'
          }
        });
      }
    }

    return result;
  }

  private async retrieveContext(
    content: string,
    criteria: string[]
  ): Promise<RAGContext> {
    // Use existing RAG infrastructure for documentation retrieval
    const embedding = await geminiEmbedder.embedText(content);
    const docs = await vectorStore.searchSimilar(embedding, 5);

    // No need to search similar messages - we have conversation context from batch

    return {
      docs,
      total_tokens: this.estimateTokens(docs)
    };
  }

  private async generateProposal(
    message: UnifiedMessage,
    classification: MessageClassification,
    ragContext: RAGContext,
    conversationContext: { contextMessages: UnifiedMessage[]; processingMessages: UnifiedMessage[] }
  ): Promise<DocumentationProposal> {
    // Build prompt with message, classification, RAG docs, and conversation snippets
    const prompt = this.buildProposalPrompt(
      message,
      classification,
      ragContext,
      conversationContext
    );

    const response = await this.llmClient.generate(prompt, 'medium');
    return JSON.parse(response);
  }
}
```

### 5. LLM Service with Model Tiering

```typescript
export class LLMService {
  private models = {
    medium: 'gemini-1.5-pro',     // Batch Classification & Proposals
    large: 'gemini-2.0-pro'       // Complex synthesis (Phase 2)
  };

  async generate(prompt: string, tier: 'medium' | 'large'): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.models[tier],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const response = await model.generateContent(prompt);
    return response.response.text();
  }
}
```

## Monitoring & Constraints

### Metrics to Track
- **Import Metrics:**
  - Messages imported per hour per stream
  - Import watermark lag (how far behind current time)
  - Failed imports and error rates

- **Processing Metrics:**
  - Batches processed per day
  - Processing watermark lag
  - Messages with doc value per batch
  - Classification efficiency (valuable/total ratio)
  - Time per batch processing

- **Proposal Metrics:**
  - Proposals generated per batch
  - Admin approval rate
  - Confidence score distribution
  - RAG retrieval latency per message
  - LLM response times (batch classification vs. proposals)

### Constraints
- **Sequential Batch Processing**: Only one 24-hour batch processed at a time
- **Watermark Atomicity**: Both watermarks updated atomically
- **Context Window**: Maximum 150 messages per window (context + processing)
- **Rate Limiting**: 15 RPM for Gemini Pro
- **Batch Size**: Fixed 24-hour windows
- **Import Independence**: Import can run continuously while processing runs

## Configuration

```bash
# Project Context
PROJECT_NAME=NearDocsAI
PROJECT_DESCRIPTION="AI-powered documentation management system"
DOC_PURPOSE="Technical documentation for developers"
TARGET_AUDIENCE="Developers, DevOps engineers"
STYLE_GUIDE="Clear, concise, technical writing"

# LLM Configuration
LLM_BATCH_CLASSIFICATION_MODEL=gemini-1.5-pro
LLM_PROPOSAL_MODEL=gemini-1.5-pro

# Processing Windows
BATCH_WINDOW_HOURS=24
CONTEXT_WINDOW_HOURS=24
MAX_MESSAGES_PER_WINDOW=150

# Watermarks
PROCESSING_WATERMARK_START_DAYS_AGO=7  # Start processing from 7 days ago
IMPORT_POLL_INTERVAL_MINUTES=5         # Check for new messages every 5 minutes

# Admin Approval
REQUIRE_ADMIN_APPROVAL=true
ADMIN_APPROVAL_TIMEOUT_DAYS=30
```

## Phase 1 Deliverables

1. **Dual Watermark System**
   - Import watermarks per stream/channel/file
   - Global processing watermark
   - Atomic watermark updates

2. **Stream Adapter System**
   - Base adapter class
   - CSV file adapter with directory monitoring
   - Import tracking and reporting

3. **Batch Classification Pipeline**
   - 24-hour batch selection with context
   - Single LLM call per batch
   - Conversation-aware analysis

4. **RAG Retrieval System**
   - Documentation search per valuable message
   - No message similarity search needed

5. **Proposal Generation**
   - Individual proposals for each valuable message
   - Conversation context included
   - Direct to admin dashboard (no automated review)

6. **Admin Dashboard**
   - Batch-aware message display
   - Manual approval/rejection workflow
   - Watermark status monitoring
   - Batch processing triggers

7. **Database Schema**
   - Watermark tables
   - Batch-aware classification
   - Admin approval tracking

8. **API Endpoints**
   - Batch management
   - Watermark monitoring
   - Proposal approval workflow

## Next Phase

Phase 2 will implement:
- Batch aggregation of approved changes
- Repository state validation
- Pull request generation
- Post-PR handling and tracking

## References

- Story: [Multi-Stream Message Scanner](/docs/stories/multi-stream-message-scanner.md)
- Phase 2 Spec: [/docs/specs/multi-stream-scanner-phase-2.md](/docs/specs/multi-stream-scanner-phase-2.md)
- RAG System: [/docs/archive/specs/rag-documentation-retrieval.md](/docs/archive/specs/rag-documentation-retrieval.md)
- Existing Analyzer: `server/analyzer/gemini-analyzer.ts`