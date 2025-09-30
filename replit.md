# NEAR Validator Documentation Website

## Project Overview
An AI-powered documentation website for NEAR validator operations that automatically updates by scraping the NEAR Zulipchat #community-support channel. The system uses OpenAI to analyze scraped content, generate update suggestions, and apply them through a hybrid approval workflow.

## Architecture
- **Frontend**: React + TypeScript with TailwindCSS and Shadcn UI
- **Backend**: Express.js with PostgreSQL database
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Token-based admin authentication (sessionStorage)
- **AI Integration**: Google Gemini (gemini-2.5-pro) for content analysis
- **Scraping**: Zulipchat REST API integration
- **Scheduling**: Node-cron for automated daily jobs

## Current Features

### Automated Content Pipeline
- **Zulipchat Scraper**: Fetches messages from NEAR's #community-support channel via REST API
- **AI Analysis**: Google Gemini analyzes messages for documentation-worthy content
- **Smart Classification**: Updates classified as "minor" (auto-applied) or "major" (requires review)
- **Daily Automation**: Scheduled job runs scraping + analysis daily (configurable)
- **Manual Triggers**: Admin can manually trigger scraping/analysis via API

### Documentation System
- Single-page documentation structure for easier AI content comparison
- Hierarchical sections with levels and ordering
- Special content types: warnings, info, success callouts
- Real-time updates from database
- Table of contents with section navigation

### Admin Dashboard
- Secure token-based authentication
- Pending updates review interface
- Approve/reject workflow with diffs
- Update history tracking
- Statistics and counts by status
- Tabbed interface: Pending, Approved, Auto-Applied, All

### Database Schema
- `documentation_sections`: Store all documentation content
  - sectionId (unique identifier), title, content
  - level (hierarchy), type (warning/info/success)
  - orderIndex for sorting
- `pending_updates`: Store AI-generated update suggestions
  - sectionId (references documentation), type (minor/major)
  - summary, source, status (pending/approved/rejected/auto-applied)
  - diffBefore/diffAfter for comparison
- `update_history`: Audit log of all actions
  - updateId (references pending_updates), action, performedBy
- `scraped_messages`: Store messages from Zulipchat
  - messageId, source, channelName, topicName
  - senderEmail, senderName, content
  - messageTimestamp, analyzed flag

### Security
- Admin endpoints protected with Bearer token authentication
- Token stored in sessionStorage (not bundled in client)
- Request validation using Zod schemas
- Proper error status codes (401, 403, 404, 409, 500)
- Transactional approval ensures data consistency
- Status guard prevents re-approving processed updates

## Recent Changes (Sept 30, 2025)

### Automated Content Pipeline (Latest)
1. Implemented Zulipchat scraper using REST API
2. Integrated Google Gemini (gemini-2.5-pro) for AI analysis
3. Created daily scheduler using node-cron
4. Added section ID validation to prevent database constraint failures
5. Implemented hybrid workflow: minor updates auto-applied, major updates require review
6. Added manual trigger API endpoint: POST /api/trigger-job
7. Comprehensive logging for debugging and monitoring
8. Successfully tested complete workflow: scraping → analysis → update creation → auto-application

### Security Improvements
1. Removed hardcoded admin token from client bundle
2. Added AdminLogin page requiring token input
3. Token stored in sessionStorage instead of environment variables
4. Created dedicated `adminApiRequest` function for authenticated calls
5. Server fails fast if ADMIN_TOKEN not set
6. Added status guards to prevent invalid state transitions (409 Conflict)

### Database Improvements
1. Added foreign key constraints with CASCADE behavior
2. Implemented proper enum types for status/type fields
3. Added Drizzle relations for better type safety
4. Transactional approval method ensures atomicity
5. Fixed return types (Promise<T | undefined> where appropriate)

### API Improvements
1. All admin endpoints protected: /api/updates, /api/updates/:id/approve, /api/updates/:id/reject, /api/history
2. Public endpoints: /api/docs, /api/docs/:sectionId
3. Request validation with Zod schemas
4. Proper error handling with correct HTTP status codes
5. 404 for not found, 409 for invalid state, 500 for server errors

## Configuration

### Environment Variables

**Required Secrets:**
- `ADMIN_TOKEN`: Admin authentication token for protected endpoints
- `DATABASE_URL`: PostgreSQL connection string (auto-configured by Replit)
- `GEMINI_API_KEY`: Google Gemini API key for AI analysis
- `ZULIP_BOT_EMAIL`: Zulipchat bot email for API access
- `ZULIP_API_KEY`: Zulipchat API key

**Optional Configuration:**
- `SCHEDULER_ENABLED`: Set to "true" to enable automated daily jobs (default: false)
- `CRON_SCHEDULE`: Cron expression for job schedule (default: "0 2 * * *" - 2 AM daily)
- `SCRAPE_LIMIT`: Max messages to scrape per run (default: 100)
- `ANALYSIS_LIMIT`: Max messages to analyze per run (default: 50)
- `ZULIP_CHANNEL`: Zulipchat channel to monitor (default: "community-support")
- `ZULIP_SITE`: Zulipchat site URL (default: "https://near.zulipchat.com")

### Scheduler Usage

The scheduler is **disabled by default**. To enable automated daily jobs:

1. Set environment variable: `SCHEDULER_ENABLED=true`
2. Optionally configure schedule: `CRON_SCHEDULE="0 2 * * *"` (2 AM daily)
3. Restart the application

**Manual Trigger:**
```bash
POST /api/trigger-job
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "scrapeLimit": 20,
  "analysisLimit": 10,
  "channelName": "community-support"
}
```

## Next Steps

1. **Frontend UI**: Add admin controls for triggering jobs and viewing scraper status
2. **Enhanced Monitoring**: Add metrics dashboard for job runs and update statistics
3. **Email Notifications**: Alert admins when major updates require review
4. **Multiple Channels**: Support scraping from multiple Zulipchat channels
5. **Telegram Integration**: Add Telegram as a second data source
6. **Deployment**: Configure for production deployment with monitoring

## Development Notes

### Running Locally
- Run `npm run dev` to start both backend and frontend
- Backend: Express on port 5000
- Frontend: Vite dev server
- Database: PostgreSQL (env: DATABASE_URL)

### Admin Access
- Navigate to `/admin/login`
- Enter ADMIN_TOKEN value
- Token stored in sessionStorage for the session
- Set ADMIN_TOKEN environment variable on server

### Database Management
- Schema: `shared/schema.ts`
- Storage layer: `server/storage.ts`
- Seed data: `server/seed.ts` (run with `npx tsx server/seed.ts`)
- Migrations: Use `npm run db:push` (never write manual SQL migrations)

## Tech Stack Details

### Frontend
- React 18 with TypeScript
- Wouter for routing
- TanStack Query for data fetching
- Shadcn UI components
- TailwindCSS for styling
- Lucide icons

### Backend
- Express.js
- Drizzle ORM with PostgreSQL
- Zod for validation
- Bearer token authentication

### Database
- PostgreSQL with Neon
- Foreign keys with CASCADE
- Enum types for constrained fields
- Transaction support for atomic operations

## User Preferences
- Single-page documentation (easier for AI to compare and update)
- Daily Zulipchat scraping (Telegram integration later)
- Hybrid approval: minor updates auto-applied, major updates require manual review
- Clean, professional UI with proper spacing and hierarchy
