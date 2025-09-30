# NEAR Validator Documentation Website

## Project Overview
An AI-powered documentation website for NEAR validator operations that automatically updates by scraping the NEAR Zulipchat #community-support channel. The system uses OpenAI to analyze scraped content, generate update suggestions, and apply them through a hybrid approval workflow.

## Architecture
- **Frontend**: React + TypeScript with TailwindCSS and Shadcn UI
- **Backend**: Express.js with PostgreSQL database
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Token-based admin authentication (sessionStorage)
- **AI Integration**: OpenAI (planned for content analysis)
- **Scraping**: Zulipchat web scraper (planned)

## Current Features

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

### Security
- Admin endpoints protected with Bearer token authentication
- Token stored in sessionStorage (not bundled in client)
- Request validation using Zod schemas
- Proper error status codes (401, 403, 404, 409, 500)
- Transactional approval ensures data consistency
- Status guard prevents re-approving processed updates

## Recent Changes (Sept 30, 2025)

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

## Next Steps

1. **Zulipchat Scraping**: Implement daily scraping of #community-support channel
2. **OpenAI Integration**: Analyze scraped messages to generate update suggestions
3. **Auto-Apply Logic**: Automatically apply minor updates, flag major ones for review
4. **Scheduled Jobs**: Set up cron job for daily scraping + analysis
5. **Testing**: End-to-end testing of complete workflow
6. **Deployment**: Configure for production deployment

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
