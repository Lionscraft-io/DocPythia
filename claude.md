# NearDocsAI Project Guide

## Claude Development Standards

**Version:** 1.0.0

### Workflow Requirements
All new features must include:
- **Story**: Context, problem statement, acceptance criteria (`/stories/`)
- **Spec**: Implementation details, data impact, dependencies (`/specs/`)
- **Branch**: Named after story/feature (no direct commits to main)
- **Review**: Code reviewed and tested before merge

### Project Structure
```
/client/src/          - Frontend React application
/server/              - Backend Express application
/docs/specs/               - Technical specifications
/docs/stories/             - Feature stories
/docs/temp/           - New or unclassified docs → `/docs/temp/` until approved
/scripts/permanent/   - Long-term scripts
/scripts/new/         - New or in-review scripts
/scripts/claude/      - AI-generated or experimental scripts
/docs/                - Approved documentation
/temp_docs/           - Draft or temporary documentation
/tests/               - Unit and integration tests
```

### Documentation Rules
- Claude does not create docs unless directed
- All outputs must link to related story/spec
- Verify file and branch placement before commits

### Development Standards
- Follow database and app conventions (consistent naming, migrations)
- Framework-aligned structure (Express, React, Drizzle ORM)
- Only approved frameworks and libraries
- File placement must match defined directories
- Mock/placeholder code only if explicitly required by spec
- Confirm before deleting files (must be in spec or prompt)

### Claude Behavior
- No praise, compliments, or conversational filler
- No mock/pseudo code unless specified
- Must link outputs to related story/spec
- Must verify file and branch placement before proposing commits
- Must ensure compliance with this document
- Focus only on correctness, structure, and compliance

### Feature Checklist
- [ ] Story written
- [ ] Spec written
- [ ] Code reviewed
- [ ] Tested
- [ ] Tests written and passing with no tests broken
- [ ] Feature branch used

## Tech Stack

**Backend:**
- Express.js server (TypeScript)
- Drizzle ORM with PostgreSQL (Neon serverless)
- Google Gemini AI for content analysis
- Node-cron for scheduled jobs
- Zulip API integration for message scraping

**Frontend:**
- React 18 with TypeScript
- Wouter for routing
- TanStack Query for data fetching
- Radix UI component library
- Tailwind CSS v4
- Vite for bundling

**Database Schema:**
- `documentation_sections` - Main documentation content
- `pending_updates` - AI-suggested changes awaiting review
- `update_history` - Audit log of approvals/rejections
- `scraped_messages` - Messages from Zulip/Telegram
- `scrape_metadata` - Incremental scraping state
- `section_versions` - Version history with rollback support

## Architecture

### Server Structure (`server/`)
- `index.ts` - Entry point, initializes DB and starts scheduler
- `routes.ts` - Express route handlers with admin auth middleware
- `schema.ts` - Drizzle schema definitions
- `storage.ts` - Database operations layer
- `db.ts` - Database connection
- `migrate.ts` - Migration runner
- `scheduler.ts` - Cron job orchestration
- `scraper/zulipchat.ts` - Zulip message fetching
- `analyzer/gemini-analyzer.ts` - AI analysis of messages

### Client Structure (`client/src/`)
- `App.tsx` - Routes: `/` (docs), `/admin`, `/admin/login`
- `components/DropdownWidget.tsx` - Embeddable AI chat widget
- `pages/Documentation.tsx` - Public docs viewer
- `pages/Admin.tsx` - Admin dashboard for reviewing updates

### Key Workflows
1. **Scrape → Analyze → Update**: Scheduler fetches Zulip messages, Gemini analyzes for doc updates, creates pending updates
2. **Admin Review**: Admins approve/reject/edit pending updates via `/admin`
3. **Version Control**: All changes tracked in `section_versions`, supports rollback
4. **Widget**: Embeddable AI assistant at `/widget/:expertId`

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `GEMINI_API_KEY` - Google Gemini API key
- `ADMIN_TOKEN` - Bearer token for admin endpoints
- `ZULIP_BOT_EMAIL` - Zulip bot email
- `ZULIP_API_KEY` - Zulip API key

Optional:
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - development/production
- `WIDGET_DOMAIN` - Widget embedding domain
- `SCHEDULER_ENABLED` - Enable cron jobs (default: false)
- `SCRAPE_LIMIT`, `ANALYSIS_LIMIT`, `CHANNEL_NAME` - Scheduler config

## Development Commands

```bash
npm run dev          # Start dev server with Vite HMR
npm run build        # Build client (Vite) + server (esbuild)
npm start            # Run production build
npm run check        # TypeScript type checking
npm run db:push      # Push schema changes to DB
```

## Admin API Endpoints example

All require `Authorization: Bearer $ADMIN_TOKEN` header:
- `POST /api/scrape` - Manually trigger Zulip scraping
- `POST /api/updates/:id/approve` - Apply update to docs...

## Public Endpoints example

- `GET /api/docs` - All documentation sections
- `GET /api/docs/:sectionId` - Single section...

## Deployment Notes

- Build creates `dist/index.js` (server) and `dist/public/` (client)
- Server serves static files from `dist/public/` in production
- Supports Docker deployment (see `Dockerfile`, `DOCKER.md`)
- Scheduler disabled by default, enable via `SCHEDULER_ENABLED=true`