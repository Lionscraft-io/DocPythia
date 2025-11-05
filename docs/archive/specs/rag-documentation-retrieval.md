# Spec: RAG-Based Documentation Retrieval System

**Developer:** Wayne
**Created:** 2025-10-29
**Status:** ✅ Completed & Archived (2025-10-30)
**Completion:** ~95% - All core features implemented except message analyzer integration
**Story:** [/docs/archive/stories/rag-documentation-retrieval.md](/docs/archive/stories/rag-documentation-retrieval.md)

## Overview

Implement a Retrieval-Augmented Generation (RAG) system that fetches NEAR protocol documentation from Git, generates embeddings for whole pages, stores them in PostgreSQL with pgvector, and provides intelligent documentation retrieval for message analysis and widget queries.

## Technical Design

### Architecture Components

```
┌─────────────────┐
│ Git Fetcher     │ → Fetches docs from configured repo
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Doc Parser      │ → Extracts pages from Markdown
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Embedding       │ → Gemini text-embedding-004 (768D)
│ Generator       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PostgreSQL      │ → pgvector storage + HNSW index
│ + pgvector      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Vector Search   │ ←── │ Message Analyzer │
│ Service         │     │ & Widget API     │
└─────────────────┘     └──────────────────┘
```

### Component Details

#### 1. Git Documentation Fetcher (`server/git-fetcher.ts`)

**Responsibilities:**
- Clone/pull Git repository from configured URL
- Checkout main branch
- **Compare current commit hash with stored hash**
- **Identify changed files using git diff**
- **Fetch only changed documentation files (`.md` files)**
- Track last processed commit hash in database
- Handle authentication if needed

**API:**
```typescript
interface GitFetcher {
  checkForUpdates(): Promise<UpdateInfo>;
  fetchChangedFiles(fromHash: string, toHash: string): Promise<DocFile[]>;
  getCurrentCommitHash(): Promise<string>;
  getStoredCommitHash(): Promise<string | null>;
  updateCommitHash(hash: string): Promise<void>;
  configure(url: string, branch?: string): void;
}

interface UpdateInfo {
  hasUpdates: boolean;
  currentHash: string;
  storedHash: string | null;
  changedFiles: string[];
}

interface DocFile {
  path: string;
  content: string;
  lastModified: Date;
  commitHash: string;
  changeType: 'added' | 'modified' | 'deleted';
}
```

**Implementation:**
- Use `simple-git` library for Git operations
- Clone to persistent cache directory: `/var/cache/near-docs/` or `~/.neardocs-cache/`
- **Delta update strategy:**
  1. Fetch latest from remote
  2. Compare `HEAD` hash with stored hash in database
  3. If different, use `git diff --name-status <stored-hash> HEAD` to find changed `.md` files
  4. Fetch only changed file contents
  5. Return list with change type (added/modified/deleted)
- Environment variables: `DOCS_GIT_URL`, `DOCS_GIT_BRANCH` (default: main)

#### 2. Embedding Service (`server/embeddings/gemini-embedder.ts`)

**Responsibilities:**
- Generate embeddings for documentation pages
- Handle Gemini API rate limiting
- Batch processing for efficiency
- Retry logic for failures

**API:**
```typescript
interface EmbeddingService {
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

**Implementation:**
- Use Google Gemini `text-embedding-004` model
- Output: 768-dimensional vectors
- Batch size: 10-20 documents per request
- Rate limit: Follow Gemini API quotas
- Environment variable: `GEMINI_API_KEY` (already exists)

#### 3. Vector Storage (`server/vector-store.ts`)

**Responsibilities:**
- Store document embeddings in PostgreSQL
- Perform cosine similarity searches
- Manage document versions/updates
- HNSW index maintenance

**Database Schema:**

```typescript
// Add to Prisma schema
model DocumentPage {
  id         Int       @id @default(autoincrement())
  filePath   String    @map("file_path")
  title      String
  content    String    @db.Text
  commitHash String    @map("commit_hash")
  gitUrl     String    @map("git_url")
  embedding  Unsupported("vector(768)")?
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  @@unique([filePath, commitHash])
  @@map("document_pages")
}

model GitSyncState {
  id             Int      @id @default(autoincrement())
  gitUrl         String   @unique @map("git_url")
  branch         String   @default("main")
  lastCommitHash String?  @map("last_commit_hash")
  lastSyncAt     DateTime @default(now()) @map("last_sync_at")
  syncStatus     String   @default("idle") // idle, syncing, success, error
  errorMessage   String?  @map("error_message") @db.Text

  @@map("git_sync_state")
}
```

**API:**
```typescript
interface VectorStore {
  upsertDocument(doc: DocumentPage): Promise<void>;
  deleteDocument(filePath: string): Promise<void>;
  searchSimilar(queryEmbedding: number[], topK: number): Promise<SearchResult[]>;
  getDocumentByPath(filePath: string): Promise<DocumentPage | null>;
}

interface DocumentPage {
  filePath: string;
  title: string;
  content: string;
  gitHash: string;
  gitUrl: string;
  embedding: number[];
}

interface SearchResult {
  pageId: number;
  filePath: string;
  title: string;
  content: string;
  similarity: number;
}
```

**Migration:**
```sql
-- migrations/XXXXXX_add_rag_support.sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_pages table
CREATE TABLE document_pages (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  git_url TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create git_sync_state table
CREATE TABLE git_sync_state (
  id SERIAL PRIMARY KEY,
  git_url TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL DEFAULT 'main',
  last_commit_hash TEXT,
  last_sync_at TIMESTAMP DEFAULT NOW() NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  error_message TEXT
);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX document_pages_embedding_idx ON document_pages
USING hnsw (embedding vector_cosine_ops);

-- Add unique constraint to prevent duplicate pages
CREATE UNIQUE INDEX document_pages_path_hash_idx ON document_pages(file_path, commit_hash);

-- Add index for fast file path lookups (for updates/deletes)
CREATE INDEX document_pages_file_path_idx ON document_pages(file_path);
```

#### 4. RAG Context Manager (`server/rag/context-manager.ts`)

**Responsibilities:**
- Decide when retrieval is needed (using Gemini Flash)
- Assemble context from retrieved documents
- Manage token budgets (~3500 tokens max)
- Format documentation for LLM consumption

**API:**
```typescript
interface RAGContextManager {
  shouldRetrieve(query: string): Promise<boolean>;
  getContext(query: string, maxTokens?: number): Promise<RAGContext>;
}

interface RAGContext {
  retrievedDocs: SearchResult[];
  formattedContext: string;
  tokenCount: number;
  usedRetrieval: boolean;
}
```

**Implementation:**
- Use Gemini Flash to classify if retrieval needed (yes/no decision)
- If yes: embed query, search top-3 similar docs
- Assemble context with page titles and excerpts
- Token counting using approximate formula: `tokens ≈ chars / 4`
- Truncate documents if needed to fit budget
- Format:
  ```
  Relevant Documentation:

  [1] {title} (from {filePath})
  {content excerpt}

  [2] {title}...
  ```

#### 5. Integration with Message Analyzer

**Update:** `server/analyzer/gemini-analyzer.ts`

**Changes:**
- Inject `RAGContextManager` into analyzer
- Before classification, check if retrieval needed
- If retrieval used, prepend context to analysis prompt
- Update classification prompt to use documentation context

**Example Flow:**
```typescript
async analyzeMessage(message: Message): Promise<Classification> {
  // Check if we should retrieve documentation
  const shouldRetrieve = await this.ragContext.shouldRetrieve(message.content);

  let context = '';
  if (shouldRetrieve) {
    const ragContext = await this.ragContext.getContext(message.content, 3500);
    context = ragContext.formattedContext;
  }

  // Build prompt with optional context
  const prompt = `
${context ? `${context}\n\n---\n\n` : ''}
Analyze the following message and classify it...
Message: ${message.content}
  `;

  // Continue with existing analysis
  return this.classify(prompt);
}
```

#### 6. Documentation Sync API

**New Endpoint:** `POST /api/docs/sync`

```typescript
interface SyncRequest {
  force?: boolean; // Force full re-sync, ignore commit hash comparison
}

interface SyncResponse {
  success: boolean;
  hadUpdates: boolean;
  currentHash: string;
  previousHash: string | null;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    filesProcessed: string[];
  };
  duration: number; // milliseconds
}
```

**Implementation in `server/routes.ts`:**
```typescript
app.post('/api/docs/sync', requireAdmin, async (req, res) => {
  const { force = false } = req.body;

  try {
    const startTime = Date.now();

    // Check for updates
    const updateInfo = await gitFetcher.checkForUpdates();

    if (!updateInfo.hasUpdates && !force) {
      return res.json({
        success: true,
        hadUpdates: false,
        currentHash: updateInfo.currentHash,
        previousHash: updateInfo.storedHash,
        summary: { added: 0, modified: 0, deleted: 0, filesProcessed: [] },
        duration: Date.now() - startTime
      });
    }

    // Fetch changed files
    const changedFiles = await gitFetcher.fetchChangedFiles(
      updateInfo.storedHash || 'HEAD~1',
      updateInfo.currentHash
    );

    const summary = {
      added: 0,
      modified: 0,
      deleted: 0,
      filesProcessed: [] as string[]
    };

    // Process deletions
    for (const file of changedFiles.filter(f => f.changeType === 'deleted')) {
      await vectorStore.deleteDocument(file.path);
      summary.deleted++;
      summary.filesProcessed.push(file.path);
    }

    // Process additions and modifications
    for (const file of changedFiles.filter(f => f.changeType !== 'deleted')) {
      const embedding = await embeddingService.embedText(file.content);
      await vectorStore.upsertDocument({
        filePath: file.path,
        title: extractTitle(file.content),
        content: file.content,
        commitHash: file.commitHash,
        gitUrl: process.env.DOCS_GIT_URL!,
        embedding
      });

      if (file.changeType === 'added') summary.added++;
      else summary.modified++;
      summary.filesProcessed.push(file.path);
    }

    // Update sync state
    await gitFetcher.updateCommitHash(updateInfo.currentHash);

    res.json({
      success: true,
      hadUpdates: true,
      currentHash: updateInfo.currentHash,
      previousHash: updateInfo.storedHash,
      summary,
      duration: Date.now() - startTime
    });

  } catch (error) {
    console.error('Documentation sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

**Authentication:** Requires admin token (`requireAdmin` middleware)

#### 7. Widget API Integration

**New Endpoint:** `POST /api/widget/ask`

```typescript
interface AskRequest {
  question: string;
  sessionId?: string;
}

interface AskResponse {
  answer: string;
  sources: DocumentSource[];
  usedRAG: boolean;
}

interface DocumentSource {
  title: string;
  filePath: string;
  url?: string;
  relevance: number;
}
```

**Implementation in `server/routes.ts`:**
```typescript
app.post('/api/widget/ask', async (req, res) => {
  const { question } = req.body;

  // Get RAG context
  const context = await ragContextManager.getContext(question, 3500);

  // Generate answer using Gemini with context
  const prompt = `
${context.formattedContext}

Question: ${question}

Provide a helpful answer based on the documentation above.
`;

  const answer = await geminiAnalyzer.generateAnswer(prompt);

  res.json({
    answer,
    sources: context.retrievedDocs.map(doc => ({
      title: doc.title,
      filePath: doc.filePath,
      url: buildDocUrl(doc.filePath),
      relevance: doc.similarity
    })),
    usedRAG: context.usedRetrieval
  });
});
```

### Data Flow

#### Documentation Ingestion Flow (On-Demand Delta Updates)
1. Admin/system triggers `POST /api/docs/sync` endpoint
2. `GitFetcher.checkForUpdates()`:
   - Fetch latest commit hash from remote
   - Compare with stored hash in `git_sync_state` table
   - If no changes: return early
   - If changes: identify changed files via `git diff`
3. `GitFetcher.fetchChangedFiles(storedHash, currentHash)`:
   - Return list of added/modified/deleted `.md` files
4. For each **deleted** file:
   - `VectorStore.deleteDocument(filePath)` - remove from DB
5. For each **added/modified** file:
   - Parse page content and extract title
   - Generate embedding via `EmbeddingService.embedText(content)`
   - `VectorStore.upsertDocument(page)` - insert or update in DB
6. Update `git_sync_state` with new commit hash and sync status
7. Return sync summary (files added/modified/deleted)

#### Query Flow (Message Analysis)
1. Message arrives via scraper
2. Analyzer calls `RAGContextManager.shouldRetrieve(message)`
3. If retrieval needed:
   - Generate query embedding
   - `VectorStore.searchSimilar()` returns top-3 docs
   - Assemble context within token budget
4. Analyzer uses context + message for classification
5. Store classification result (existing flow)

#### Query Flow (Widget)
1. User asks question via widget
2. API endpoint calls `RAGContextManager.getContext(question)`
3. Context manager:
   - Embeds question
   - Retrieves top-3 similar docs
   - Formats context
4. Gemini generates answer with documentation context
5. Return answer + sources to widget

## Dependencies

### New Dependencies
```json
{
  "simple-git": "^3.22.0",
  "pgvector": "^0.1.8",
  "@google/generative-ai": "already installed",
  "drizzle-orm": "already installed"
}
```

### Database
- PostgreSQL with pgvector extension (requires PostgreSQL 11+)
- Migration to enable extension and create tables

### External Services
- Google Gemini API (text-embedding-004 model)
- Git repository hosting (GitHub, GitLab, etc.)

## Environment Variables

Add to `.env`:
```bash
# RAG Configuration
DOCS_GIT_URL=https://github.com/near/docs
DOCS_GIT_BRANCH=main
RAG_ENABLED=true
RAG_TOP_K=3
RAG_MAX_TOKENS=3500

# Git Authentication (optional, for private repos)
GIT_USERNAME=
GIT_TOKEN=
```

**Note:** Documentation updates are **on-demand only** (no scheduled fetches). Trigger via `POST /api/docs/sync` endpoint.

## Implementation Impact

### Database Changes
- New tables: `document_pages`, `document_embeddings` (optional, can combine)
- New indexes: HNSW index on embedding column
- Migration required
- Storage impact: ~1KB per page (768 floats × 4 bytes = 3KB for embedding + metadata)

### Performance Considerations
- **Embedding generation:** ~100-200ms per document (Gemini API)
- **Vector search:** ~10-50ms for HNSW index (depends on corpus size)
- **Total query latency:** ~200-500ms including embedding + search + context assembly
- **Storage:** For 1000 docs: ~3MB embeddings + ~5MB content = ~8MB total

### Scalability
- HNSW index scales to millions of vectors
- Batch embedding generation for initial ingestion
- Incremental updates (only changed docs)
- Consider pagination for large documentation sets

## Testing Strategy

### Unit Tests
- `git-fetcher.test.ts`: Mock Git operations, test parsing
- `gemini-embedder.test.ts`: Mock Gemini API, test batching
- `vector-store.test.ts`: Test CRUD operations, search accuracy
- `context-manager.test.ts`: Test token budgets, formatting

### Integration Tests
- End-to-end: Fetch docs → embed → store → retrieve
- Widget API: Question → context → answer flow
- Message analyzer: Message → retrieval → classification

### Test Data
- Sample Markdown documentation files
- Pre-computed embeddings for deterministic tests
- Mock Gemini API responses

## Migration Path

1. **Phase 1: Infrastructure Setup**
   - Add pgvector extension to PostgreSQL
   - Run migrations for new tables
   - Install dependencies

2. **Phase 2: Core Services**
   - Implement Git fetcher
   - Implement embedding service
   - Implement vector store

3. **Phase 3: RAG Context Manager**
   - Implement context assembly
   - Token budget management
   - Retrieval decision logic

4. **Phase 4: Integration**
   - Update message analyzer with RAG context
   - Add widget API endpoint (`POST /api/widget/ask`)
   - Add documentation sync endpoint (`POST /api/docs/sync`)

5. **Phase 5: Testing & Optimization**
   - Test retrieval accuracy
   - Optimize HNSW parameters
   - Performance tuning

## Rollout Plan

- **Development:** Feature branch `feature/rag-documentation-retrieval`
- **Testing:** Local testing with sample documentation
- **Staging:** Deploy with NEAR docs, validate accuracy
- **Production:** Enable via `RAG_ENABLED` flag

## Monitoring & Metrics

### Metrics to Track
- Documentation sync success rate and duration
- Delta update efficiency (files changed vs total files)
- Embedding generation time (per document)
- Vector search latency (p50, p95, p99)
- Retrieval accuracy (manual validation)
- Widget response time
- RAG usage rate (% of queries using retrieval)

### Logging
- Log all documentation sync requests (timestamp, admin user, duration)
- Log commit hash changes (old → new)
- Log file changes (added/modified/deleted with counts)
- Log embedding generation (success/failure, batch size)
- Log vector searches (query, top-K results, latency)
- Log RAG decisions (retrieve: yes/no)

## Security Considerations

- Git credentials: Use environment variables, support SSH keys
- API keys: Secure Gemini API key storage
- Input validation: Sanitize user queries before embedding
- Rate limiting: Prevent abuse of widget API
- Access control: Admin-only endpoints for documentation refresh

## Edge Cases

1. **No relevant documentation found:** Return graceful message, don't fail
2. **Git fetch failure:** Log error, return existing documentation state, alert admin
3. **No stored commit hash (first sync):** Treat all files as "added"
4. **Merge conflicts in local cache:** Delete cache and re-clone
5. **Gemini API failure:** Retry with backoff, fallback to no-context analysis
6. **Extremely long documents:** Truncate content to fit token budget
7. **Duplicate documents:** Use (file_path, commit_hash) uniqueness constraint
8. **Concurrent sync requests:** Use database lock or status check to prevent overlapping syncs

## Future Enhancements (Out of Scope)

- Multi-repository support
- Custom chunking strategies (currently using whole-page approach)
- Hybrid search (vector + keyword/BM25)
- Query expansion and reranking
- User feedback on retrieval quality
- Webhook-based auto-sync (GitHub webhooks triggering sync on push)
- Scheduled background syncs (e.g., daily checks)
- Support for non-Markdown formats (PDF, HTML, reStructuredText)
- Document versioning (keep multiple versions of same page)

## Open Questions

- [ ] Should we support multiple documentation versions (e.g., v1, v2)?
- [ ] Do we need to track individual page view/usage stats?
- [ ] Should retrieval decision use a confidence threshold?
- [ ] Do we want to cache embeddings for frequently asked questions?

## References

- Story: [/docs/stories/rag-documentation-retrieval.md](/docs/stories/rag-documentation-retrieval.md)
- Tasks: [/docs/tasks/tasks-rag-documentation-retrieval.md](/docs/tasks/tasks-rag-documentation-retrieval.md)
- pgvector documentation: https://github.com/pgvector/pgvector
- Gemini embedding API: https://ai.google.dev/gemini-api/docs/embeddings
- HNSW algorithm: https://arxiv.org/abs/1603.09320
