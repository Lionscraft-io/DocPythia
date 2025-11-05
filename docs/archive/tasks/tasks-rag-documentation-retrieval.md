# Tasks: RAG-Based Documentation Retrieval System

**Developer:** Wayne
**Created:** 2025-10-29
**Status:** ✅ Completed & Archived (2025-10-30)
**Story:** [/docs/archive/stories/rag-documentation-retrieval.md](/docs/archive/stories/rag-documentation-retrieval.md)
**Spec:** [/docs/archive/specs/rag-documentation-retrieval.md](/docs/archive/specs/rag-documentation-retrieval.md)

## Implementation Summary

This RAG implementation is ~95% complete with all core infrastructure deployed:
- ✅ Git documentation fetcher with delta updates (server/git-fetcher.ts)
- ✅ Gemini embeddings with 768D vectors (server/embeddings/gemini-embedder.ts)
- ✅ pgvector storage with HNSW indexing (server/vector-store.ts)
- ✅ RAG context manager (server/rag/context-manager.ts)
- ✅ Widget API endpoint (POST /api/widget/ask)
- ✅ Documentation sync API (POST /api/docs/sync)
- ✅ Git stats dashboard (GET /api/docs/git-stats)
- ❌ Message analyzer integration (not yet implemented)

**Current Status:** 1914 Conflux documentation pages embedded and searchable

## Implementation Tasks

### Phase 1: Infrastructure Setup

- [ ] **Task 1.1:** Add pgvector extension to PostgreSQL
  - Verify PostgreSQL version (11+ required)
  - Enable pgvector extension in database
  - Test vector operations work correctly
  - **Estimate:** 1 hour

- [ ] **Task 1.2:** Create database migration for RAG tables
  - Create migration file: `migrations/XXXXXX_add_pgvector_support.sql`
  - Define `document_pages` table schema
  - Create HNSW index on embedding column
  - Add unique constraint on (file_path, git_hash)
  - **Estimate:** 2 hours

- [ ] **Task 1.3:** Run migration and verify schema
  - Execute migration on development database
  - Verify tables and indexes created correctly
  - Test vector operations (insert, search)
  - **Estimate:** 1 hour

- [ ] **Task 1.4:** Install dependencies
  - Add `simple-git` for Git operations
  - Add `pgvector` driver if needed
  - Update `package.json` and `package-lock.json`
  - Run `npm install` and verify builds
  - **Estimate:** 0.5 hours

- [ ] **Task 1.5:** Add environment variables
  - Update `.env.example` with RAG configuration
  - Update `server/env.ts` to load RAG variables
  - Document configuration in spec/README
  - **Estimate:** 0.5 hours

**Phase 1 Total:** ~5 hours

---

### Phase 2: Git Documentation Fetcher

- [ ] **Task 2.1:** Create Git fetcher service
  - Create `server/git-fetcher.ts`
  - Implement `fetchLatest()` method using simple-git
  - Handle clone vs. pull logic
  - Add error handling and logging
  - **Estimate:** 3 hours

- [ ] **Task 2.2:** Implement documentation parser
  - Extract `.md` files from cloned repository
  - Parse frontmatter/metadata if present
  - Extract page title from content or filename
  - Create `DocFile` objects with metadata
  - **Estimate:** 2 hours

- [ ] **Task 2.3:** Add caching and cleanup logic
  - Implement persistent cache directory
  - Clean up old clones (keep last 2)
  - Track last fetch timestamp
  - Handle authentication (SSH keys, tokens)
  - **Estimate:** 2 hours

- [ ] **Task 2.4:** Write unit tests for Git fetcher
  - Mock Git operations
  - Test parsing logic
  - Test error handling
  - Test cleanup logic
  - **Estimate:** 2 hours

**Phase 2 Total:** ~9 hours

---

### Phase 3: Embedding Service

- [ ] **Task 3.1:** Create Gemini embedding service
  - Create `server/embeddings/gemini-embedder.ts`
  - Implement `embedText()` method
  - Use Gemini `text-embedding-004` model
  - Handle API key from environment
  - **Estimate:** 2 hours

- [ ] **Task 3.2:** Implement batch embedding
  - Create `embedBatch()` method
  - Batch 10-20 documents per request
  - Handle rate limiting
  - Add retry logic with exponential backoff
  - **Estimate:** 3 hours

- [ ] **Task 3.3:** Add embedding validation
  - Verify output dimensions (768)
  - Handle malformed responses
  - Add logging for success/failure
  - **Estimate:** 1 hour

- [ ] **Task 3.4:** Write unit tests for embedder
  - Mock Gemini API responses
  - Test batch processing
  - Test error handling and retries
  - **Estimate:** 2 hours

**Phase 3 Total:** ~8 hours

---

### Phase 4: Vector Store

- [ ] **Task 4.1:** Update Drizzle schema
  - Add `document_pages` table to `server/schema.ts`
  - Define vector column type
  - Add indexes and constraints
  - Generate Drizzle types
  - **Estimate:** 2 hours

- [ ] **Task 4.2:** Create vector store service
  - Create `server/vector-store.ts`
  - Implement `upsertDocument()` method
  - Handle vector serialization for PostgreSQL
  - Add logging
  - **Estimate:** 3 hours

- [ ] **Task 4.3:** Implement vector search
  - Create `searchSimilar()` method
  - Use cosine similarity with pgvector
  - Return top-K results with scores
  - Handle empty results gracefully
  - **Estimate:** 3 hours

- [ ] **Task 4.4:** Add document management methods
  - Implement `deleteByGitHash()` for updates
  - Add `getDocumentById()` method
  - Add `listAllDocuments()` for admin
  - **Estimate:** 2 hours

- [ ] **Task 4.5:** Write unit tests for vector store
  - Test CRUD operations
  - Test search accuracy with known vectors
  - Test edge cases (no results, duplicates)
  - **Estimate:** 3 hours

**Phase 4 Total:** ~13 hours

---

### Phase 5: RAG Context Manager

- [ ] **Task 5.1:** Create context manager service
  - Create `server/rag/context-manager.ts`
  - Implement `getContext()` method
  - Integrate embedding service and vector store
  - **Estimate:** 2 hours

- [ ] **Task 5.2:** Implement retrieval decision logic
  - Create `shouldRetrieve()` method
  - Use Gemini Flash for yes/no classification
  - Handle API failures gracefully
  - **Estimate:** 2 hours

- [ ] **Task 5.3:** Implement token budget management
  - Add token counting (chars / 4 approximation)
  - Truncate documents to fit budget (~3500 tokens)
  - Prioritize by similarity score
  - **Estimate:** 2 hours

- [ ] **Task 5.4:** Format context for LLM consumption
  - Create formatted context string
  - Include page titles and file paths
  - Add source citations
  - Make it clear and readable
  - **Estimate:** 1 hour

- [ ] **Task 5.5:** Write unit tests for context manager
  - Test token counting
  - Test context assembly
  - Test retrieval decision logic
  - Mock dependencies
  - **Estimate:** 3 hours

**Phase 5 Total:** ~10 hours

---

### Phase 6: Message Analyzer Integration

- [ ] **Task 6.1:** Update message analyzer
  - Inject `RAGContextManager` into `server/analyzer/gemini-analyzer.ts`
  - Call `shouldRetrieve()` before classification
  - Prepend context to analysis prompt
  - **Estimate:** 2 hours

- [ ] **Task 6.2:** Update classification prompt
  - Modify prompt to use documentation context
  - Ensure context is clearly separated
  - Test with and without context
  - **Estimate:** 1 hour

- [ ] **Task 6.3:** Add logging for RAG usage
  - Log when retrieval is used
  - Log retrieved document titles
  - Track retrieval decisions (yes/no)
  - **Estimate:** 1 hour

- [ ] **Task 6.4:** Write integration tests
  - Test message analysis with RAG
  - Test message analysis without RAG
  - Verify classification accuracy
  - **Estimate:** 2 hours

**Phase 6 Total:** ~6 hours

---

### Phase 7: Widget API Integration

- [ ] **Task 7.1:** Create widget API endpoint
  - Add `POST /api/widget/ask` to `server/routes.ts`
  - Accept question in request body
  - Return answer + sources
  - **Estimate:** 2 hours

- [ ] **Task 7.2:** Implement answer generation
  - Use `RAGContextManager.getContext()`
  - Build prompt with context
  - Call Gemini to generate answer
  - Format response with sources
  - **Estimate:** 2 hours

- [ ] **Task 7.3:** Add error handling
  - Handle missing question
  - Handle RAG failures gracefully
  - Return appropriate HTTP status codes
  - Add request validation
  - **Estimate:** 1 hour

- [ ] **Task 7.4:** Update widget frontend
  - Modify `client/src/components/DropdownWidget.tsx`
  - Add UI for asking questions
  - Display answer with source citations
  - Show loading state
  - **Estimate:** 3 hours

- [ ] **Task 7.5:** Write API tests
  - Test successful question/answer flow
  - Test error cases
  - Test source citations
  - **Estimate:** 2 hours

**Phase 7 Total:** ~10 hours

---

### Phase 8: Documentation Sync Scheduler

- [ ] **Task 8.1:** Create documentation sync job
  - Create `server/jobs/sync-documentation.ts`
  - Orchestrate: fetch → parse → embed → store
  - Handle incremental updates (compare git hashes)
  - Delete outdated documents
  - **Estimate:** 3 hours

- [ ] **Task 8.2:** Integrate with scheduler
  - Add job to `server/scheduler.ts`
  - Use cron expression from environment
  - Add manual trigger endpoint for admin
  - **Estimate:** 2 hours

- [ ] **Task 8.3:** Add progress logging
  - Log start/end of sync
  - Log number of documents processed
  - Log errors and failures
  - Track sync duration
  - **Estimate:** 1 hour

- [ ] **Task 8.4:** Create admin endpoint for manual sync
  - Add `POST /api/admin/sync-docs` endpoint
  - Require authentication
  - Return sync status
  - **Estimate:** 2 hours

**Phase 8 Total:** ~8 hours

---

### Phase 9: Testing & Validation

- [ ] **Task 9.1:** End-to-end testing
  - Test full flow: Git fetch → embed → store → retrieve
  - Use sample NEAR documentation
  - Validate retrieval accuracy
  - **Estimate:** 3 hours

- [ ] **Task 9.2:** Performance testing
  - Measure embedding generation time
  - Measure vector search latency
  - Test with 100, 500, 1000 documents
  - Optimize HNSW parameters if needed
  - **Estimate:** 3 hours

- [ ] **Task 9.3:** Widget testing
  - Test question/answer flow in UI
  - Validate source citations
  - Test error scenarios
  - **Estimate:** 2 hours

- [ ] **Task 9.4:** Message analyzer testing
  - Test message classification with RAG
  - Compare accuracy with/without context
  - Validate retrieval decisions
  - **Estimate:** 2 hours

**Phase 9 Total:** ~10 hours

---

### Phase 10: Documentation & Deployment

- [ ] **Task 10.1:** Update README documentation
  - Document RAG system architecture
  - Add setup instructions
  - Document environment variables
  - Add troubleshooting section
  - **Estimate:** 2 hours

- [ ] **Task 10.2:** Create deployment guide
  - Document pgvector installation
  - Document migration steps
  - Document configuration
  - Add rollback procedure
  - **Estimate:** 2 hours

- [ ] **Task 10.3:** Update API documentation
  - Document widget API endpoint
  - Document admin sync endpoint
  - Add request/response examples
  - **Estimate:** 1 hour

- [ ] **Task 10.4:** Deploy to staging
  - Run migrations
  - Configure environment variables
  - Test documentation sync
  - Validate functionality
  - **Estimate:** 2 hours

- [ ] **Task 10.5:** Production deployment
  - Run migrations on production
  - Enable feature flag
  - Monitor performance
  - Validate accuracy
  - **Estimate:** 2 hours

**Phase 10 Total:** ~9 hours

---

## Summary

**Total Estimated Hours:** ~88 hours (~11 days)

**Critical Path:**
1. Phase 1: Infrastructure (must be first)
2. Phase 2-4: Core services (can partially parallel)
3. Phase 5: Context manager (depends on 2-4)
4. Phase 6-7: Integrations (depends on 5)
5. Phase 8: Scheduler (depends on all core services)
6. Phase 9-10: Testing and deployment

**Risks:**
- pgvector extension compatibility with existing PostgreSQL setup
- Gemini API rate limits during initial documentation ingestion
- Vector search performance with large documentation corpus
- Retrieval accuracy tuning may require iteration

**Dependencies:**
- PostgreSQL with pgvector support
- Gemini API access
- NEAR documentation Git repository access
- Existing message analyzer and scraper infrastructure

**Next Steps:**
1. Review and approve this task breakdown
2. Create feature branch: `feature/rag-documentation-retrieval`
3. Begin Phase 1 (Infrastructure Setup)
