# Story: Multi-Stream Message Scanner with Watermark Tracking

**Developer:** Wayne
**Created:** 2025-10-30
**Updated:** 2025-11-04
**Status:** Partially Implemented
**Feature:** Universal stream adapter system for message ingestion and analysis

**Implementation Status:**
- ✅ Phase 1 Complete: Batch analysis & proposals (see `/docs/specs/multi-stream-scanner-phase-1.md`)
- ✅ Telegram adapter implemented
- ✅ CSV file adapter implemented
- ⏸️ Phase 2 Pending: PR generation (not yet started)
- ⏸️ Additional adapters deferred: Discord, Slack, Webhook, ZulipChat refactor (see `/docs/specs/future-stream-adapters.md`)

## Context

NearDocsAI currently supports specific message sources (ZulipChat, Telegram, Discord) with hardcoded scrapers. Organizations need a more flexible system that can:
- Ingest messages from any stream source (Slack, Teams, custom APIs, file uploads)
- Track processing state using watermarks to avoid reprocessing
- Support batch file uploads for historical data import
- Maintain a consistent analysis pipeline regardless of source

The system should use watermark-based tracking (datetime + message ID) to ensure exactly-once processing and support incremental updates from multiple simultaneous streams.

## Problem Statement

Current limitations:
1. Each new message source requires custom scraper implementation
2. No standardized way to track processing state across different streams
3. No support for batch file imports or CSV-based message ingestion
4. Difficult to add new stream sources without modifying core code
5. No unified watermark system for resumable processing
6. Cannot process historical data from file exports

This limits adoption for organizations using different communication platforms or wanting to import historical data.

## User Stories

**As a system administrator**, I want to configure multiple message streams with different adapters so that I can aggregate messages from all our communication channels.

**As a data analyst**, I want to upload CSV files containing historical messages so that I can analyze past conversations without API access.

**As a developer**, I want to implement a new stream adapter using a standard interface so that I can add support for new platforms quickly.

**As the message processor**, I want to track watermarks per stream so that I can resume processing from the last successful point after interruptions.

**As the analyzer**, I want to process messages uniformly regardless of source so that analysis logic remains consistent.

## Acceptance Criteria

### Stream Adapter System
- [x] Define generic `StreamAdapter` interface with standard methods
- [x] Support multiple adapter types: API-based, webhook-based, file-based
- [x] Each adapter maintains its own watermark state
- [x] Adapters can be added/removed without system restart
- [x] Configuration through environment variables or config files

### Watermark Tracking
- [x] Store per-stream watermarks in database
- [x] Support composite watermarks (datetime + optional message ID)
- [x] Atomic watermark updates with message processing
- [x] Ability to reset or manually adjust watermarks
- [x] Watermark state survives system restarts

### File Stream Processor
- [x] Accept CSV files with configurable column mapping
- [x] Support formats: `date, message` at minimum
- [ ] Process files from `inbox` directory (uses manual import instead)
- [ ] Move completed files to `processed` directory (uses manual import instead)
- [ ] Generate processing report for each file (logs only)
- [x] Handle malformed data gracefully

### Message Analysis Pipeline
- [x] Unified message format across all streams
- [x] RAG-based context retrieval for each message
- [x] LLM analysis to determine documentation relevance
- [x] Confidence scoring for update recommendations
- [x] Batch processing support for efficiency

### Supported Initial Adapters
- [x] Telegram (implemented with full bot integration)
- [ ] Discord (deferred - see `/docs/specs/future-stream-adapters.md`)
- [ ] ZulipChat (legacy scraper exists, refactoring deferred)
- [x] File/CSV adapter (implemented with manual import)
- [ ] Slack adapter (deferred - see `/docs/specs/future-stream-adapters.md`)
- [ ] Generic webhook adapter (deferred - see `/docs/specs/future-stream-adapters.md`)

## Success Metrics

- Processing latency < 5 seconds per message
- Support for 10+ simultaneous streams
- Zero message loss during system restarts
- 95% accuracy in documentation update detection
- < 1% duplicate message processing

## Dependencies

- Existing RAG infrastructure (completed)
- Message analyzer (existing)
- Database with watermark storage
- File system access for CSV processing

## Non-Goals

- Real-time streaming (batch processing is acceptable)
- Message response/interaction capabilities
- Modification of source messages
- Bi-directional synchronization

## Security Considerations

- Stream credentials stored securely (environment variables)
- File uploads scanned for malicious content
- Rate limiting per stream to prevent abuse
- Audit logs for all stream operations

## References

- Previous spec: [RAG Documentation Retrieval](/docs/archive/specs/rag-documentation-retrieval.md)
- Message Analyzer: [server/analyzer/gemini-analyzer.ts](server/analyzer/gemini-analyzer.ts)