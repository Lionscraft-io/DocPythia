# Future Improvements

This document tracks planned improvements and technical debt identified during the open source readiness review.

## Priority Levels

- **P0 (Critical)**: Security issues, blocking bugs
- **P1 (High)**: Important improvements affecting adoption
- **P2 (Medium)**: Quality of life improvements
- **P3 (Low)**: Nice to have

---

## Code Quality

### ~~P1: Logging Migration~~ COMPLETED

**Status:** High-priority files migrated (December 2025)

~~**Effort:** Large (868 occurrences across 50 files)~~

Replace `console.log` statements with the structured logger utility.

**Location:** `server/utils/logger.ts`

**Usage:**
```typescript
import { createLogger } from './utils/logger';

const logger = createLogger('ModuleName');

// Instead of: console.log('Starting process...');
logger.info('Starting process...');

// Instead of: console.error('Failed:', error);
logger.error('Failed:', error);
```

**Completed files:**
| File | Count | Status |
|------|-------|--------|
| `server/stream/stream-manager.ts` | 54 | DONE |
| `server/validate-workflow.ts` | 47 | Skipped (CLI tool) |
| `server/stream/processors/batch-message-processor.ts` | 43 | DONE |
| `server/stream/routes/admin-routes.ts` | 41 | DONE |
| `server/routes.ts` | 40 | Moved to route modules |
| `server/llm/llm-cache.ts` | 28 | DONE |
| `server/analyzer/gemini-analyzer.ts` | 21 | DONE |

### ~~P1: Routes Modularization~~ COMPLETED

**Status:** Completed (December 2025)

~~**Effort:** Medium (1495 lines)~~

Split `server/routes.ts` into domain-specific modules.

**Implemented structure:**
```
server/routes/
├── index.ts              # Central route registration
├── auth-routes.ts        # Authentication endpoints
├── health-routes.ts      # Health check, diagnostics
├── config-routes.ts      # Public configuration endpoint
├── docs-routes.ts        # Documentation CRUD and sync
├── widget-routes.ts      # Widget HTML and ask endpoints
├── widget-embed-routes.ts # Widget JS library and demo page
├── admin-panel-routes.ts # Admin operations (updates, messages, cache)
```

All route modules use structured logger utility.

### P2: Remove Commented-Out Code

Audit codebase for commented-out code blocks and remove them. Use git history for recovery if needed.

### P3: Consistent Error Handling

Implement consistent error handling pattern across all API endpoints with proper error codes and messages.

---

## Architecture

### P1: LLM Provider Abstraction

**Current state:** Tight coupling to Google Gemini API

Create an abstraction layer for LLM providers to support:
- Google Gemini (current)
- OpenAI GPT-4
- Anthropic Claude
- Local models (Ollama, llama.cpp)

**Proposed interface:**
```typescript
interface LLMProvider {
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T>;
  embed(text: string): Promise<number[]>;
}
```

### P2: Message Queue Integration

Consider adding Redis or RabbitMQ for:
- Async message processing
- Better job queue management
- Horizontal scaling support
- Retry with exponential backoff

### P2: Configuration Management

**Current issues:**
- Instance-specific credentials in env variables don't scale
- Poor organization for many instances

**Recommendation:**
- Load instance configs from S3 or secure vault
- Use AWS Secrets Manager or HashiCorp Vault in production
- Implement config hot-reloading

### P3: Webhook Support

Add webhook endpoints for:
- Proposal status changes
- PR merge notifications
- Processing completion events

---

## Security

### P1: Session Storage Improvement

**Current state:** Admin tokens stored in sessionStorage (vulnerable to XSS)

**Recommendation:**
- Migrate to httpOnly cookies
- Implement CSRF protection
- Add token refresh mechanism

### P2: Rate Limiting

Add rate limiting for:
- Authentication endpoints
- Public API endpoints
- LLM-powered endpoints (expensive operations)

### P2: Input Validation Audit

Audit all API endpoints for proper input validation:
- SQL injection prevention (Prisma handles this, but verify raw queries)
- XSS prevention in stored content
- Path traversal in file operations

### P3: Security Headers

Add security headers via middleware:
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

---

## Documentation

### P1: API Documentation (Swagger/OpenAPI)

Add OpenAPI/Swagger documentation:

```bash
npm install swagger-jsdoc swagger-ui-express
```

**Tasks:**
- Document all endpoints with JSDoc comments
- Generate OpenAPI spec
- Add Swagger UI at `/api/docs`
- Generate TypeScript client SDK

### P2: Architecture Decision Records (ADRs)

Document key decisions in `/docs/architecture/decisions/`:
- ADR-001: PostgreSQL over MongoDB
- ADR-002: Gemini as primary LLM
- ADR-003: Multi-tenant design approach
- ADR-004: Prisma over Drizzle migration

### P3: Video Tutorials

Create video content for:
- Getting started walkthrough
- Admin dashboard usage
- Stream adapter configuration
- Custom instance setup

---

## Testing

### P1: Coverage Goals

**Target:** 80% coverage for core modules

Current status tracked in `/docs/coverage-80-percent-plan.md`

Priority modules:
- Core business logic
- API endpoints
- Stream adapters
- LLM service

### P2: Integration Tests

Add integration tests for:
- Full message processing pipeline
- GitHub PR creation workflow
- Multi-instance authentication

### P2: E2E Testing

Add Playwright or Cypress tests for:
- Admin dashboard workflows
- Widget interactions
- Authentication flows

### P3: Load Testing

Add k6 or Artillery tests for:
- API endpoint performance
- Concurrent user handling
- Database query performance

---

## Performance

### P2: Database Query Optimization

- Add missing indexes identified via EXPLAIN ANALYZE
- Implement connection pooling for high-traffic deployments
- Consider read replicas for analytics queries
- Optimize N+1 queries in batch processing

### P2: Caching Improvements

- Implement Redis caching for frequently accessed data
- Add cache invalidation strategies
- Consider CDN for static documentation assets
- Cache LLM responses more aggressively

### P3: Bundle Size Optimization

- Analyze frontend bundle size
- Implement code splitting
- Lazy load admin routes
- Tree-shake unused dependencies

---

## Developer Experience

### P2: Development Container

Add `.devcontainer/` configuration for:
- VS Code Dev Containers
- GitHub Codespaces
- Consistent development environment

### P2: Pre-commit Hooks

Add Husky with:
- ESLint on staged files
- Prettier formatting
- Type checking
- Commit message validation

```bash
npm install -D husky lint-staged
npx husky init
```

### P3: Hot Module Replacement

Improve development experience with:
- Faster HMR for frontend
- Backend hot-reload improvements
- Database seed scripts for testing

---

## File Organization

### P2: Move Test Data Files

Move root-level test files to proper directories:

| Current | Target |
|---------|--------|
| `testdata.csv` | `tests/fixtures/testdata.csv` |
| `sample-comments.csv` | `tests/fixtures/sample-comments.csv` |
| `check-stream-status.sql` | `scripts/database/check-stream-status.sql` |

### P2: SQL Scripts Organization

Move scattered SQL files:
```
scripts/
├── database/
│   ├── check-stream-status.sql
│   ├── setup-telegram-bot.sql
│   └── insert-testdata-to-prod.sql → sample-data.sql
```

### P3: Config Examples

Ensure all config files have `.example` versions:
- `config/instance.example.json` ✓
- `config/<instance>/instance.example.json`
- `config/<instance>/doc-index.config.example.json`

---

## Dependency Management

### P2: Audit Dependencies

Run security audit and address vulnerabilities:
```bash
npm audit
npm audit fix
```

### P3: Remove Unused Dependencies

Audit for unused dependencies:
```bash
npx depcheck
```

Potential candidates to review:
- Multiple Radix UI components (verify all are used)
- Charting libraries
- Form libraries

---

## Monitoring & Observability

### P2: Structured Logging Format

Enhance logger to output JSON in production:
```json
{
  "timestamp": "2025-01-01T00:00:00.000Z",
  "level": "info",
  "module": "StreamManager",
  "message": "Processing batch",
  "batchId": "abc123",
  "messageCount": 50
}
```

### P2: Metrics Endpoint

Add `/metrics` endpoint for Prometheus:
- Request latency
- Error rates
- Queue depth
- LLM API usage

### P3: Distributed Tracing

Add OpenTelemetry support for:
- Request tracing across services
- LLM call tracing
- Database query tracing

---

## Roadmap Priority

### Phase 1 (Next Release)
1. ~~Logging migration (P1)~~ DONE
2. ~~Routes modularization (P1)~~ DONE
3. API documentation (P1)
4. Session storage improvement (P1)

### Phase 2
1. LLM provider abstraction (P1)
2. Test coverage to 80% (P1)
3. Rate limiting (P2)
4. Caching improvements (P2)

### Phase 3
1. Message queue integration (P2)
2. E2E testing (P2)
3. Development container (P2)
4. Metrics endpoint (P2)

---

## Contributing

We welcome contributions to address these improvements! See [CONTRIBUTING.md](/CONTRIBUTING.md) for guidelines.

When working on improvements:
1. Check if an issue exists or create one
2. Reference this document in your PR
3. Update this document when completing items
