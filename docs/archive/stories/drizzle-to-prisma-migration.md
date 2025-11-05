# Story: Drizzle to Prisma ORM Migration

**Developer:** Wayne
**Date:** 2025-10-29
**Feature:** Database ORM Migration
**Complexity:** Moderate

## Context

The NearDocsAI project currently uses Drizzle ORM for database interactions with PostgreSQL (Neon). Wayne prefers Prisma ORM due to greater familiarity and ease of use. This migration will replace Drizzle with Prisma across the entire codebase.

## Problem Statement

Drizzle ORM is less familiar to Wayne, making development and maintenance more difficult than necessary. Prisma offers:
- Better developer experience for Wayne's workflow
- More intuitive schema definition and migration tools
- Stronger TypeScript integration
- More familiar query patterns

## Acceptance Criteria

### Must Have
- [ ] Prisma schema created matching current Drizzle schema structure
- [ ] All database models migrated: `documentation_sections`, `pending_updates`, `update_history`, `scraped_messages`, `scrape_metadata`, `section_versions`
- [ ] All database queries converted from Drizzle to Prisma Client
- [ ] Database migration system switched from Drizzle to Prisma Migrate
- [ ] All affected files updated: `server/schema.ts`, `server/storage.ts`, `server/db.ts`, `server/migrate.ts`
- [ ] Application starts successfully with Prisma
- [ ] Core workflows function correctly: scraping, analysis, update approval, version history

### Should Have
- [ ] Prisma Studio accessible for database inspection
- [ ] Development workflow documented for future schema changes
- [ ] All Drizzle dependencies removed from package.json

### Won't Have (Out of Scope)
- Data migration scripts (database can be reset)
- Rollback strategy (urgent migration, no rollback planned)
- Gradual/phased migration (full migration at once)
- Data preservation (no existing data needs to be kept)

## Technical Constraints

- **Database:** PostgreSQL via Neon (connection string in `.env`)
- **Data Loss Acceptable:** Database can be reset, no data preservation required
- **Migration Approach:** Full replacement, not incremental
- **Timeline:** Urgent, execute immediately

## Dependencies

**Blocked By:**
- None (can proceed immediately)

**Blocks:**
- Future database schema changes (will use Prisma Migrate workflow)

## Success Metrics

- Application runs without errors using Prisma
- All existing API endpoints function correctly
- Database queries execute successfully
- Wayne can use Prisma schema and tooling comfortably

## Related Documentation

- Specification: [/docs/specs/drizzle-to-prisma-migration.md](/docs/specs/drizzle-to-prisma-migration.md)
- Tasks: [/docs/tasks/tasks-drizzle-to-prisma-migration.md](/docs/tasks/tasks-drizzle-to-prisma-migration.md)

## Notes

- This migration prioritizes developer experience over backward compatibility
- Database reset is acceptable, simplifying the migration significantly
- No testing or rollback strategy required per Wayne's requirements
