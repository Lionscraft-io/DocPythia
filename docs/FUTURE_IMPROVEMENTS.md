# Future Improvements

This document tracks planned improvements and technical debt for future releases.

## Code Quality

### Logging Migration

**Priority:** Medium
**Effort:** Large (868 occurrences across 50 files)

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

**Files with most occurrences:**
- `server/stream/stream-manager.ts` (54)
- `server/validate-workflow.ts` (47)
- `server/stream/processors/batch-message-processor.ts` (43)
- `server/stream/routes/admin-routes.ts` (41)
- `server/routes.ts` (40)

### Routes Modularization

**Priority:** Medium
**Effort:** Medium (1495 lines)

Split `server/routes.ts` into domain-specific modules.

**Proposed structure:**
```
server/routes/
├── index.ts           # Main router, combines all routes
├── auth-routes.ts     # Authentication (exists)
├── admin-routes.ts    # Admin panel endpoints
├── widget-routes.ts   # Chat widget endpoints
├── docs-routes.ts     # Documentation CRUD
├── health-routes.ts   # Health check, diagnostics
└── stream-routes.ts   # Stream management
```

**Migration approach:**
1. Create new route modules
2. Move related endpoints
3. Update imports in main routes.ts
4. Test each module independently

## Architecture

### LLM Provider Abstraction

Create an abstraction layer for LLM providers to support:
- Google Gemini (current)
- OpenAI GPT-4
- Anthropic Claude
- Local models (Ollama)

### Message Queue Integration

Consider adding Redis or RabbitMQ for:
- Async message processing
- Better job queue management
- Horizontal scaling support

## Performance

### Database Query Optimization

- Add missing indexes identified via EXPLAIN ANALYZE
- Implement connection pooling for high-traffic deployments
- Consider read replicas for analytics queries

### Caching Improvements

- Implement Redis caching for frequently accessed data
- Add cache invalidation strategies
- Consider CDN for static documentation assets

## Testing

### Coverage Goals

Current status tracked in `/docs/coverage-80-percent-plan.md`

Target: 80% coverage for:
- Core business logic
- API endpoints
- Stream adapters
- LLM service

### E2E Testing

Add Playwright or Cypress tests for:
- Admin dashboard workflows
- Widget interactions
- Authentication flows

## Documentation

### API Documentation

Add OpenAPI/Swagger documentation:
- Install `swagger-jsdoc` and `swagger-ui-express`
- Document all endpoints
- Generate client SDKs

### Architecture Decision Records

Document key decisions:
- Why PostgreSQL over MongoDB
- Why Gemini as primary LLM
- Multi-tenant design decisions
