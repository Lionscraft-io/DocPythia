# Story: RAG-Based Documentation Retrieval System

**Developer:** Wayne
**Created:** 2025-10-29
**Status:** ✅ Completed & Archived (2025-10-30)
**Feature:** Vector-based documentation search and retrieval
**Spec:** [/docs/archive/specs/rag-documentation-retrieval.md](/docs/archive/specs/rag-documentation-retrieval.md)

## Context

NearDocsAI currently scrapes and analyzes messages from Zulip, Telegram, and Discord, but lacks the ability to provide relevant documentation context when answering questions. Users need intelligent documentation retrieval that understands semantic meaning and provides whole-page context rather than fragmented chunks.

The system should automatically fetch the latest NEAR protocol documentation from Git, embed entire pages using vector representations, and intelligently retrieve relevant documentation when analyzing messages or answering questions through the widget.

## Problem Statement

Current limitations:
1. Message analysis happens without documentation context
2. No semantic search capability for finding relevant docs
3. Manual process to keep documentation synchronized
4. Widget cannot provide documentation-backed answers
5. No way to match user questions with related documentation pages

This limits the value proposition of NearDocsAI as a documentation intelligence platform.

## User Stories

**As a system administrator**, I want documentation to be automatically fetched from configured Git repositories so that the knowledge base stays current without manual intervention.

**As a message analyzer**, I want to retrieve relevant documentation pages when processing user questions so that I can provide context-aware, documentation-backed responses.

**As a widget user**, I want to ask questions and receive answers with relevant documentation context so that I can quickly find authoritative information.

**As a developer**, I want to store whole documentation pages instead of chunks so that semantic context is preserved and page boundaries are respected.

## Acceptance Criteria

### Documentation Ingestion
- [ ] System fetches latest documentation from configured Git URL (main branch)
- [ ] Documentation pages are downloaded and stored
- [ ] Each page is embedded as a complete unit (no chunking)
- [ ] Embeddings are generated using Google Gemini text-embedding-004 (768 dimensions)
- [ ] PostgreSQL with pgvector extension stores embeddings
- [ ] HNSW index created for efficient cosine similarity search

### Message Processing with RAG
- [ ] Message analyzer intelligently decides when RAG retrieval is needed
- [ ] Top 3 most semantically similar documentation pages are retrieved
- [ ] Retrieved documentation provides context for message classification
- [ ] Token budget management (~3500 tokens max for context)
- [ ] System handles cases where no relevant documentation exists

### Widget Integration
- [ ] Widget questions trigger RAG-powered search
- [ ] Responses include relevant documentation excerpts
- [ ] Documentation sources are cited/linked
- [ ] Performance remains acceptable (< 2s response time)

### Data Management
- [ ] pgvector extension enabled on PostgreSQL
- [ ] New tables created for document storage and embeddings
- [ ] Migration path for existing database
- [ ] Support for documentation versioning/updates
- [ ] Multi-tenancy considerations addressed

## Success Metrics

- Documentation automatically synced from Git (daily or on-demand)
- Message analysis includes relevant documentation context when available
- Widget responses backed by authoritative documentation
- Sub-2-second retrieval performance for vector searches
- Top-3 retrieval accuracy validated against test queries

## Out of Scope

- Chunking of documentation pages (using whole pages instead)
- Support for non-Markdown documentation formats initially
- Real-time Git webhook integration (scheduled fetch is sufficient)
- Advanced query expansion or multi-hop reasoning
- Custom embedding models (using Gemini text-embedding-004)

## Dependencies

- PostgreSQL database with pgvector extension capability
- Google Gemini API access (text-embedding-004 model)
- Git repository access for documentation source
- Existing message scraping infrastructure (Zulip, Telegram, Discord)
- Current message analyzer (`server/analyzer/gemini-analyzer.ts`)

## Technical Constraints

- Use Google Gemini text-embedding-004 (768 dimensions)
- PostgreSQL with pgvector extension
- HNSW index for cosine similarity
- Whole-page embedding (no chunking)
- ~3500 token budget for context assembly
- Compatible with existing Express backend and Drizzle ORM

## References

- Reference implementation patterns from Wayne's other RAG project
- Existing analyzer: `server/analyzer/gemini-analyzer.ts`
- Existing scraper: `server/scraper/zulipchat.ts`
- Spec: [/docs/specs/rag-documentation-retrieval.md](/docs/specs/rag-documentation-retrieval.md)
- Tasks: [/docs/tasks/tasks-rag-documentation-retrieval.md](/docs/tasks/tasks-rag-documentation-retrieval.md)
