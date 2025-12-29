# Multi-Instance Database Implementation Status

## What Was Done

### 1. Database Setup ✅
- Created `projectbdocs` database
- Ran migrations on both `projectadocs` and `projectbdocs`
- Seeded both databases with documentation sections
  - projectadocs: 24 sections
  - projectbdocs: 3 sections

### 2. Code Infrastructure ✅
- Instance-aware database manager exists: `server/db/instance-db.ts`
  - Creates separate Prisma clients per instance
  - Dynamically builds database URLs from config
  - Caches clients for performance

- Instance middleware exists: `server/middleware/instance.ts`
  - Extracts instance ID from URL
  - Loads instance config
  - Attaches instance context to request (`req.instance.db`)

- Admin routes updated: `server/stream/routes/admin-routes.ts`
  - Added `getDb(req)` helper function
  - Replaced all `prisma.` with `db.`
  - Uses instance-aware database from request context

### 3. Current Status ⚠️

**Working:**
- ✅ Both databases exist and are migrated
- ✅ Instance database manager code is complete
- ✅ Instance middleware code is complete
- ✅ Admin routes are updated to use instance database
- ✅ Multi-instance authentication works
- ✅ Passwords: `projecta123` (Project A), `projectb123` (Project B)

**Not Working:**
- ❌ Middleware routing is not correctly matching URLs
- ❌ Instance ID being parsed from wrong part of URL
- ❌ API requests returning HTML instead of JSON

## The Problem

The middleware is being applied but the routing doesn't work correctly:

```typescript
// Current setup in routes.ts:
app.use('/:instance/api', instanceMiddleware);
registerAdminStreamRoutes(app, adminAuth);

// Admin routes are defined as:
app.get('/api/admin/stream/stats', ...)

// Request URL:
GET /projecta/api/admin/stream/stats
```

When the request comes in:
1. Express tries to match `/:instance/api`
2. It correctly captures `instance = "projecta"`
3. But the admin routes are registered with absolute paths (`/api/admin/...`)
4. The routes don't match because they expect `/api/admin/...` not `/projecta/api/admin/...`
5. Request falls through to static file handler → returns HTML

## Solutions to Consider

### Option A: Rewrite Admin Routes (Complex)
Update all admin routes to be relative and mount them under the instance prefix:
```typescript
// In routes.ts:
app.use('/:instance', instanceMiddleware);
app.use('/:instance/api/admin', adminStreamRoutes);

// In admin-routes.ts, change all routes from:
app.get('/api/admin/stream/stats', ...)
// To:
router.get('/stream/stats', ...)  // Relative paths
```

**Pros:** Clean separation, proper REST structure
**Cons:** Requires rewriting ~20+ route handlers

### Option B: URL Rewriting in Middleware (Hack)
Have the middleware strip the instance prefix from the URL before continuing:
```typescript
// In instance middleware:
req.url = req.url.replace(`/${instanceId}`, '');
req.originalUrl = ...
```

**Pros:** Minimal changes to existing code
**Cons:** Fragile, might break other middleware

### Option C: Single Shared Database (Simplest)
Don't use instance-specific databases. Use the existing `projectadocs` database for both instances:
```typescript
// Remove instance middleware
// Keep using global prisma client
// Store instance_id as a column in tables
```

**Pros:** Simple, works immediately
**Cons:** No data isolation between instances

## Recommendation

For development, **Option C** (shared database) is simplest and most practical unless you specifically need data isolation.

For production with data isolation, **Option A** (proper routing) is the right long-term solution.

## Testing Commands

Once fixed, test with:
```bash
# Project A instance
curl -s "http://localhost:3762/projecta/api/admin/stream/stats" \
  -H "Authorization: Bearer projecta123" | jq

# Project B instance
curl -s "http://localhost:3762/projectb/api/admin/stream/stats" \
  -H "Authorization: Bearer projectb123" | jq
```

Expected: Different database stats for each instance
