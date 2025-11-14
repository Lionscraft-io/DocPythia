# Multi-Instance Routing Issue - Current Status

## Date: 2025-11-13

## What Works ✅

1. **Database Infrastructure**
   - `neardocs` database: 24 sections
   - `confluxdocs` database: 3 sections
   - Both databases migrated and seeded

2. **Instance Middleware**
   - Correctly extracts instance ID from URL (`near`, `conflux`)
   - Loads instance-specific configuration
   - Creates instance-specific database connections
   - Attaches `req.instance` context with `{ id, config, db }`

3. **getDb() Helper**
   - Successfully added to all admin route handlers
   - Returns instance-specific Prisma client

4. **Multi-Instance Authentication**
   - Works correctly for both NEAR and Conflux
   - Passwords: `near123`, `conflux123`
   - Smart login detects correct instance

## The Routing Problem ❌

### Current Behavior
- Request: `GET /near/api/admin/stream/stats`
- Middleware runs correctly, extracts `instance="near"`
- Route handler NEVER executes
- Falls through to Vite middleware → Returns HTML instead of JSON

### Root Cause
Express routing with parametric middleware is complex:

**Attempt 1**: Mount middleware at `/:instance/api/admin`
- Problem: After stripping `/near/api/admin`, remaining path is `/stream/stats`
- Route expects: `/api/admin/stream/stats`
- NO MATCH

**Attempt 2**: Mount middleware at `/:instance`
- Problem: After stripping `/near`, remaining path is `/api/admin/stream/stats`
- But routes are in different routing context
- NO MATCH

**Attempt 3**: Register routes BEFORE middleware
- Problem: Routes at root level, middleware creates sub-router context
- Still NO MATCH

### Middleware Mount Attempts

| Attempt | Mount Point | Request | Remaining Path | Route | Match? |
|---------|------------|---------|----------------|-------|--------|
| 1 | `/:instance/api/admin` | `/near/api/admin/stream/stats` | `/stream/stats` | `/api/admin/stream/stats` | ❌ |
| 2 | `/:instance` | `/near/api/admin/stream/stats` | `/api/admin/stream/stats` | `/api/admin/stream/stats` (wrong context) | ❌ |
| 3 | `/:instance/api` | `/near/api/admin/stream/stats` | `/admin/stream/stats` | `/api/admin/stream/stats` | ❌ |

## Potential Solutions

### Option A: Dual Route Registration (Simple, Works)
Register BOTH versions of each route:
```typescript
// Non-instance version (existing)
app.get('/api/admin/stream/stats', adminAuth, handler);

// Instance version (new)
app.get('/:instance/api/admin/stream/stats', instanceMiddleware, adminAuth, handler);
```

**Pros:**
- Guaranteed to work
- Explicit and clear
- Supports both instance and non-instance URLs

**Cons:**
- Need to update ~20+ route handlers
- More code duplication

### Option B: Helper Function (Clean)
Create a route registration helper:
```typescript
function registerDualRoute(
  app: Express,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  ...middleware: any[]
) {
  // Register non-instance version
  app[method](path, ...middleware);

  // Register instance version
  app[method](`/:instance${path}`, instanceMiddleware, ...middleware);
}

// Usage
registerDualRoute(app, 'get', '/api/admin/stream/stats', adminAuth, handler);
```

**Pros:**
- DRY (Don't Repeat Yourself)
- Easy to maintain
- Clean abstraction

**Cons:**
- Requires refactoring all route registrations
- Need to ensure correct middleware order

### Option C: Express Router (Proper, Complex)
Use Express Router to properly scope routes:
```typescript
const adminRouter = express.Router({ mergeParams: true });
adminRouter.get('/stream/stats', handler);

app.use('/api/admin', adminRouter);  // Non-instance
app.use('/:instance/api/admin', instanceMiddleware, adminRouter);  // Instance
```

**Pros:**
- Proper Express pattern
- Clean separation
- Router middleware isolation

**Cons:**
- Requires significant refactoring
- Need to convert all absolute paths to relative
- More complex to understand

## Recommendation

**Use Option A (Dual Registration) for now** - it's the fastest path to working multi-instance routing.

Once that's working, we can refactor to Option B (Helper Function) for cleaner code.

## Files Modified

1. `server/middleware/instance.ts` - Instance detection middleware
2. `server/routes.ts` - Middleware mounting configuration
3. `server/stream/routes/admin-routes.ts` - Added `getDb()` to all handlers
4. `config/near/instance.json` - NEAR instance config with database name
5. `config/conflux/instance.json` - Conflux instance config with database name

## Next Steps

1. Implement Option A or B above
2. Test with `curl http://localhost:3762/near/api/admin/stream/stats -H "Authorization: Bearer near123"`
3. Verify correct database is used (should return NEAR data, not Conflux data)
4. Test Conflux instance similarly
5. Update MULTI_INSTANCE_DATABASE_STATUS.md with resolution
