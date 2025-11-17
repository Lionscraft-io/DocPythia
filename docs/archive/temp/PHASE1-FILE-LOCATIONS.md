# Multi-Stream Message Scanner Phase 1 - File Locations

## Absolute File Paths Reference

### Database Schema
- `/root/src/lionscraft-NearDocsAI/prisma/schema.prisma` (lines 195-331)
  - ImportWatermark table (lines 215-231)
  - ProcessingWatermark table (lines 234-241)
  - UnifiedMessage table (lines 244-269)
  - MessageClassification table (lines 279-294)
  - MessageRagContext table (lines 297-307)
  - DocProposal table (lines 310-331)

### Core Stream Management

#### Stream Manager
- `/root/src/lionscraft-NearDocsAI/server/stream/stream-manager.ts` (442 lines)
  - `StreamManager` class
  - `initialize()` - Load stream configs
  - `registerStream()` - Register individual stream
  - `runStream()` - Execute stream fetch/process
  - `importStream()` - Import without processing
  - `getHealth()` - Stream health status
  - `getStats()` - Overall statistics
  - `shutdown()` - Graceful shutdown

#### Stream Types
- `/root/src/lionscraft-NearDocsAI/server/stream/types.ts` (195 lines)
  - DocumentationPageIndex interface
  - DocumentationIndex interface
  - ProjectContext interface
  - StreamMessage interface
  - StreamWatermark interface
  - StreamAdapter interface
  - MessageClassification interface
  - RAGContext interface
  - DocProposal interface
  - LLMModel enum
  - LLMRequest, LLMResponse interfaces
  - AdminMessageAnalysis interface

### Stream Adapters

#### Base Adapter
- `/root/src/lionscraft-NearDocsAI/server/stream/adapters/base-adapter.ts` (242 lines)
  - `BaseStreamAdapter` abstract class
  - `initialize()` - Setup with config
  - `fetchMessages()` - Abstract, implemented by subclasses
  - `validateConfig()` - Abstract validation
  - `cleanup()` - Resource cleanup
  - `getWatermark()` - Retrieve current watermark
  - `updateWatermark()` - Persist watermark updates
  - `saveMessages()` - Store to database (duplicate method)
  - `ensureStreamConfig()` - Create/update config
  - `ensureWatermark()` - Ensure watermark exists

#### CSV File Adapter
- `/root/src/lionscraft-NearDocsAI/server/stream/adapters/csv-file-adapter.ts` (277 lines)
  - `CsvFileAdapter` extends BaseStreamAdapter
  - `CsvFileConfig` interface
  - `ProcessingReport` interface
  - `initialize()` - Setup directories
  - `validateConfig()` - CSV config validation
  - `fetchMessages()` - Parse CSV files
  - `getInboxFiles()` - List CSV files
  - `processFile()` - Parse individual file
  - `parseRow()` - Convert CSV row to StreamMessage
  - `moveToProcessed()` - File rotation
  - `saveProcessingReport()` - Report generation

### Message Processing

#### Batch Message Processor
- `/root/src/lionscraft-NearDocsAI/server/stream/processors/batch-message-processor.ts` (350+ lines)
  - `BatchMessageProcessor` class
  - `BatchClassificationResultSchema` - Zod validation
  - `ProposalGenerationSchema` - Zod validation
  - `BatchProcessorConfig` interface
  - `processBatch()` - Main orchestration
  - `getProcessingWatermark()` - Load watermark
  - `updateProcessingWatermark()` - Update watermark
  - `fetchMessagesForBatch()` - Query batch window
  - `classifyBatch()` - LLM classification (LLM-1)
  - `storeClassificationResults()` - Store to DB
  - `processValuableMessage()` - RAG + Proposal per message
  - `performRAG()` - Retrieve relevant docs (NEEDS WORK)
  - `generateProposal()` - Generate proposal (LLM-2)
  - `estimateTokens()` - Token accounting

#### Message Processor (Individual)
- `/root/src/lionscraft-NearDocsAI/server/stream/processors/message-processor.ts` (593+ lines)
  - `MessageProcessor` class
  - `ProcessingResult` interface
  - `ProcessingStats` interface
  - `ProcessingConfig` interface
  - `processBatch()` - Process message batch
  - LLM integration for individual message analysis
  - Singleton instance export

#### Message Vector Search
- `/root/src/lionscraft-NearDocsAI/server/stream/message-vector-search.ts` (197 lines)
  - `MessageVectorSearch` class
  - `SimilarMessage` interface
  - `generateEmbedding()` - Create embedding
  - `storeEmbedding()` - Store to pgvector
  - `searchSimilarMessages()` - Cosine similarity search
  - `searchSimilarByContent()` - Content-based search
  - `getEmbeddedMessagesCount()` - Count messages with embeddings
  - `hasEmbedding()` - Check if message has embedding
  - `batchStoreEmbeddings()` - Batch storage

### LLM Integration

#### LLM Service
- `/root/src/lionscraft-NearDocsAI/server/stream/llm/llm-service.ts` (400+ lines)
  - `LLMService` class
  - `MODEL_MAP` - Model to API name mapping
  - `DEFAULT_CONFIGS` - Config per model tier
  - `request()` - Base LLM request with retries
  - `requestJSON()` - Structured JSON request
  - `makeRequest()` - Execute single request
  - `getOrCreateModel()` - Model caching
  - `buildPrompt()` - Combine system + user prompts
  - `parseJSON()` - JSON validation with error handling
  - `delay()` - Retry delay utility
  - Singleton instance export

#### Prompt Builders
- `/root/src/lionscraft-NearDocsAI/server/stream/llm/prompt-builders.ts` (150+ lines)
  - `PromptBuilders` class
  - `buildClassificationPrompt()` - Batch classification (LLM-1)
  - `getClassificationSchema()` - Response schema
  - `buildProposalPrompt()` - Proposal generation (LLM-2)
  - Prompt templates with guidelines
  - Category definitions
  - Error handling instructions

### Documentation Index

- `/root/src/lionscraft-NearDocsAI/server/stream/doc-index-generator.ts` (171+ lines)
  - `DocumentationIndexGenerator` class
  - `DocIndexConfig` interface
  - `generateIndex()` - Main generation logic
  - `extractSections()` - Parse markdown headers
  - `generateSummary()` - Summarize content
  - `categorizePages()` - Group by directory
  - `formatForPrompt()` - Format for LLM
  - `formatCompact()` - Compact format
  - `loadFromDatabase()` - Load cached index
  - `saveToDatabase()` - Cache to DB
  - Singleton instance export
  - `loadDocumentationIndex()` function

### RAG System

#### Vector Store
- `/root/src/lionscraft-NearDocsAI/server/vector-store.ts` (160+ lines)
  - `PgVectorStore` class
  - `DocumentPage` interface
  - `SearchResult` interface
  - `VectorStore` interface
  - `upsertDocument()` - Store doc with embedding
  - `deleteDocument()` - Remove doc
  - `searchSimilar()` - Vector similarity search
  - `getDocumentByPath()` - Retrieve by path
  - Vector conversion utilities

#### RAG Context Manager
- `/root/src/lionscraft-NearDocsAI/server/rag/context-manager.ts` (233 lines)
  - `GeminiRAGContextManager` class
  - `RAGContext` interface
  - `RAGContextManager` interface
  - `shouldRetrieve()` - Decide if RAG needed
  - `getContext()` - Retrieve documentation context
  - `formatContext()` - Format docs for LLM
  - `truncateContent()` - Fit to token budget
  - `estimateTokens()` - Token counting
  - Singleton instance export

#### Gemini Embedder
- `/root/src/lionscraft-NearDocsAI/server/embeddings/gemini-embedder.ts` (198 lines)
  - `GeminiEmbedder` class
  - `embedText()` - Generate embedding
  - `embedBatch()` - Batch embeddings
  - Embedding model configuration
  - Caching of embeddings
  - Error handling

### Admin Routes

- `/root/src/lionscraft-NearDocsAI/server/stream/routes/admin-routes.ts` (360+ lines)
  - `registerAdminStreamRoutes()` - Express middleware
  - Validation schemas:
    - `paginationSchema` - Page, limit
    - `filterSchema` - docValue, approved, streamId, category, batchId
    - `processRequestSchema` - Stream process request
    - `approveProposalSchema` - Proposal approval
  - Endpoints:
    - `GET /api/admin/stream/stats` - Statistics
    - `GET /api/admin/stream/messages` - Message list
    - `GET /api/admin/stream/messages/:id` - Message detail
    - `POST /api/admin/stream/process` - Import trigger
    - `POST /api/admin/stream/process-batch` - Batch processing
    - `GET /api/admin/stream/proposals` - Proposal list
    - `POST /api/admin/stream/proposals/:id/approve` - Approve/reject

### Server Integration

#### Main Server Entry
- `/root/src/lionscraft-NearDocsAI/server/index.ts`
  - StreamManager initialization
  - Stream configuration loading
  - Stream scheduling setup

#### Route Registration
- `/root/src/lionscraft-NearDocsAI/server/routes.ts`
  - `registerAdminStreamRoutes()` import and registration
  - Admin auth middleware application

### Configuration

- `/root/src/lionscraft-NearDocsAI/server/config/`
  - `loader.ts` - Configuration loading
  - `schemas.ts` - Validation schemas
  - `defaults.ts` - Default values
  - `types.ts` - Type definitions

### Documentation

- `/root/src/lionscraft-NearDocsAI/docs/specs/multi-stream-scanner-phase-1.md` - Main specification
- `/root/src/lionscraft-NearDocsAI/docs/stories/multi-stream-message-scanner.md` - Feature story
- `/root/src/lionscraft-NearDocsAI/docs/specs/multi-stream-scanner-phase-2.md` - Phase 2 spec
- `/root/src/lionscraft-NearDocsAI/docs/temp/multi-stream-phase1-implementation-status.md` - This report
- `/root/src/lionscraft-NearDocsAI/docs/temp/PHASE1-IMPLEMENTATION-SUMMARY.md` - Quick reference
- `/root/src/lionscraft-NearDocsAI/docs/temp/PHASE1-FILE-LOCATIONS.md` - This file

### Tests (if any)

- `/root/src/lionscraft-NearDocsAI/tests/` - Unit and integration tests directory
- Test files for stream processing (location TBD)

## Database Migration Files

- Migrations are managed by Prisma
- Run: `npx prisma migrate deploy`
- Schema source: `/root/src/lionscraft-NearDocsAI/prisma/schema.prisma`

## Configuration Files

- Environment: `.env` or `.env.local`
- Prisma: `prisma/schema.prisma`
- Doc Index: `server/config/doc-index.config.json` (if present)

## Key Statistics

- Total implementation files: ~20 core files
- Total lines of code: ~3,500+ lines
- Database tables: 6 new tables (+ existing tables)
- API endpoints: 7+ new endpoints
- Test coverage: [To be determined]

---

**Date Generated:** 2025-11-03
**Status:** Phase 1 - 85-90% Complete
**Last Verified:** File listing matches actual directory structure
