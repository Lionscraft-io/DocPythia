# Specification: Drizzle to Prisma ORM Migration

**Developer:** Wayne
**Date:** 2025-10-29
**Story:** [/docs/stories/drizzle-to-prisma-migration.md](/docs/stories/drizzle-to-prisma-migration.md)

## Overview

Complete replacement of Drizzle ORM with Prisma ORM across the NearDocsAI codebase. This includes schema migration, query conversion, and tooling updates.

## Implementation Details

### 1. Schema Migration

**Current Drizzle Schema (`server/schema.ts`):**
- `documentation_sections` - Main documentation content
- `pending_updates` - Updates awaiting approval
- `update_history` - Approved update log
- `scraped_messages` - Raw Zulip messages
- `scrape_metadata` - Scraping job tracking
- `section_versions` - Version history for sections

**New Prisma Schema (`prisma/schema.prisma`):**
Create equivalent Prisma models with:
- Matching field types and constraints
- Proper relations (1:many between sections and updates/versions)
- Timestamp fields (`createdAt`, `updatedAt` where applicable)
- PostgreSQL-specific types (JSON, TEXT, TIMESTAMP)

**Schema Location:**
- Create `prisma/schema.prisma` at project root
- Configure `datasource` to use `DATABASE_URL` from environment
- Set `provider = "postgresql"`
- Configure `client` output to `node_modules/.prisma/client`

### 2. Database Client Replacement

**File: `server/db.ts`**
- Remove Drizzle imports (`drizzle`, `neon`)
- Add Prisma Client initialization
- Export singleton Prisma instance
- Handle connection lifecycle

**Before (Drizzle):**
```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
```

**After (Prisma):**
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
```

### 3. Query Pattern Conversion

**Storage Layer (`server/storage.ts`):**
Convert all database operations from Drizzle to Prisma syntax:

| Operation | Drizzle | Prisma |
|-----------|---------|--------|
| Select All | `db.select().from(table)` | `prisma.model.findMany()` |
| Select by ID | `db.select().from(table).where(eq(table.id, id))` | `prisma.model.findUnique({ where: { id } })` |
| Insert | `db.insert(table).values(data)` | `prisma.model.create({ data })` |
| Update | `db.update(table).set(data).where(...)` | `prisma.model.update({ where, data })` |
| Delete | `db.delete(table).where(...)` | `prisma.model.delete({ where })` |
| Transactions | `db.transaction(...)` | `prisma.$transaction([...])` |

**Key Conversions:**
- Replace Drizzle query builder with Prisma Client methods
- Convert `eq`, `and`, `or` filters to Prisma `where` clauses
- Update relation queries to use Prisma `include`/`select`
- Migrate transaction handling to Prisma's transaction API

### 4. Migration System Replacement

**File: `server/migrate.ts`**
- Remove Drizzle migration runner
- Use Prisma Migrate CLI commands
- Update migration scripts in `package.json`

**New Migration Commands:**
```json
{
  "scripts": {
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "migrate:reset": "prisma migrate reset",
    "db:studio": "prisma studio",
    "db:generate": "prisma generate"
  }
}
```

### 5. Dependency Updates

**Remove from `package.json`:**
- `drizzle-orm`
- `drizzle-kit`
- `@neondatabase/serverless` (if only used by Drizzle)

**Add to `package.json`:**
- `@prisma/client` (runtime client)
- `prisma` (dev dependency for CLI)

### 6. Files Requiring Changes

| File Path | Changes |
|-----------|---------|
| `server/schema.ts` | Delete or convert to Prisma types (optional) |
| `server/db.ts` | Replace Drizzle client with Prisma Client |
| `server/storage.ts` | Convert all queries to Prisma syntax |
| `server/migrate.ts` | Update to use Prisma Migrate |
| `server/index.ts` | Update any direct DB imports |
| `server/scraper/zulipchat.ts` | Update scraper storage calls |
| `server/analyzer/gemini-analyzer.ts` | Update analyzer storage calls |
| `server/scheduler.ts` | Update scheduler storage calls |
| `server/seed.ts` | Convert seed script to Prisma |
| `drizzle.config.ts` | Delete (no longer needed) |
| `package.json` | Update dependencies and scripts |
| `prisma/schema.prisma` | Create (new file) |

### 7. Environment Variables

**No changes required:**
- Continue using `DATABASE_URL` for PostgreSQL connection
- Prisma reads `DATABASE_URL` from `.env` automatically

**Prisma-specific variables (optional):**
- `PRISMA_QUERY_LOG=true` - Enable query logging in development

## Data Impact

**Database Reset Required:**
- Existing database will be dropped and recreated
- All current data will be lost (acceptable per requirements)
- Fresh schema will be created via `prisma migrate dev`

**Schema Changes:**
- No logical schema changes planned
- Field names and types remain equivalent
- Prisma may generate different constraint names

**Migration Steps:**
1. Create Prisma schema matching current structure
2. Run `prisma migrate dev --name init` to create initial migration
3. Database will be reset and new schema applied
4. Re-run seed scripts if needed

## Dependencies

**External Libraries:**
- `@prisma/client@^5.x` - Runtime query client
- `prisma@^5.x` - CLI and migration tools

**Internal Dependencies:**
- All modules using `server/storage.ts` (no changes needed, interface remains same)
- Scripts using database: `server/scripts/*.ts`

**Breaking Changes:**
- Drizzle-specific query patterns will no longer work
- Direct schema imports must be updated to Prisma types
- Migration commands change from `drizzle-kit` to `prisma`

## Testing Strategy

**Manual Testing (per Wayne's requirements):**
- Start application and verify no errors
- Test scraping workflow: Zulip → database storage
- Test analysis workflow: Gemini analysis → pending updates
- Test update approval: Approve update → version history
- Test frontend: Documentation display, version history, stats

**No Automated Tests Required:**
- Wayne specified not to worry about testing
- Existing tests may need updates but not critical for this migration

## Rollback Plan

**None (per requirements):**
- Wayne specified urgent migration without rollback strategy
- If issues occur, debug and fix forward rather than rollback

## Performance Considerations

**Query Performance:**
- Prisma Client is generally comparable to Drizzle
- May generate slightly different SQL queries
- Use Prisma's query logging to verify performance

**Connection Pooling:**
- Prisma manages connection pooling automatically
- No special configuration needed for Neon PostgreSQL

## Security Considerations

**No Security Changes:**
- Database credentials remain in environment variables
- Prisma Client does not introduce new security vectors
- SQL injection protection via parameterized queries (same as Drizzle)

## Documentation Updates

**Files to Update:**
- `docs/README.md` - Update tech stack section
- `README.md` (if exists) - Update ORM references
- Any developer onboarding docs mentioning Drizzle

## Development Workflow Changes

**Schema Changes (future):**
1. Edit `prisma/schema.prisma`
2. Run `prisma migrate dev --name <description>`
3. Prisma generates migration SQL automatically
4. Review migration in `prisma/migrations/` folder
5. Commit migration files to git

**Database Inspection:**
- Use `npx prisma studio` for GUI database browser
- Alternative: continue using existing PostgreSQL tools

## Success Criteria

- [ ] Application starts without Drizzle-related errors
- [ ] All API endpoints respond correctly
- [ ] Scraping jobs execute and store data
- [ ] Analysis workflow creates pending updates
- [ ] Update approval creates version history
- [ ] Frontend displays documentation correctly
- [ ] `npx prisma studio` opens successfully
- [ ] No Drizzle dependencies remain in `package.json`

## Related Documentation

- Story: [/docs/stories/drizzle-to-prisma-migration.md](/docs/stories/drizzle-to-prisma-migration.md)
- Tasks: [/docs/tasks/tasks-drizzle-to-prisma-migration.md](/docs/tasks/tasks-drizzle-to-prisma-migration.md)

## Implementation Notes

**Order of Operations:**
1. Install Prisma dependencies
2. Create Prisma schema
3. Update `server/db.ts` (client initialization)
4. Update `server/storage.ts` (all queries)
5. Update other files using storage layer
6. Remove Drizzle dependencies
7. Run initial migration and test

**Prisma Schema Example Structure:**
```prisma
model DocumentationSection {
  id          String   @id @default(cuid())
  nodeType    String
  title       String
  content     String   @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  pendingUpdates PendingUpdate[]
  versions       SectionVersion[]
}
```

**Key Prisma Features to Use:**
- `@default(cuid())` for auto-generated IDs
- `@db.Text` for large text fields
- `@updatedAt` for automatic timestamp updates
- Relation fields for foreign keys
