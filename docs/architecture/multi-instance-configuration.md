# Architecture: Multi-Instance Customer Configuration System

**Developer:** Wayne
**Date:** 2025-10-29
**Related Story:** `/docs/stories/multi-instance-configuration.md`
**Related Spec:** `/docs/specs/multi-instance-configuration.md`

## Executive Summary

This document describes the architecture for transforming DocPythia from a single-protocol platform into a multi-customer configurable system. The architecture supports independent deployments per customer with configuration-driven branding, documentation sources, and community integrations, without requiring code modifications.

## System Context

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DocPythia (Current)                      │
│                                                           │
│  ┌─────────────┐      ┌──────────────┐                 │
│  │  Frontend   │──────│  Backend      │                 │
│  │  (React)    │      │  (Express)    │                 │
│  │             │      │               │                 │
│  │ HARDCODED:  │      │ HARDCODED:    │                 │
│  │ - "Project" │      │ - owner/docs  │                 │
│  │ - Logo      │      │ - Prompts     │                 │
│  │ - Colors    │      │ - Zulip URL   │                 │
│  └─────────────┘      └──────────────┘                 │
│                              │                            │
│                       ┌──────▼──────┐                    │
│                       │  PostgreSQL  │                    │
│                       │  (Drizzle)   │                    │
│                       └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Multi-Instance Deployment                       │
│                                                                    │
│  ┌────────────────────────────────────────────────────────┐     │
│  │           Configuration Layer (New)                     │     │
│  │                                                          │     │
│  │  ┌──────────────┐   ┌──────────────┐   ┌───────────┐ │     │
│  │  │   Defaults   │───│ instance.json│───│    ENV    │ │     │
│  │  │  (Default)   │   │  (Optional)  │   │ Variables │ │     │
│  │  └──────────────┘   └──────────────┘   └───────────┘ │     │
│  │         │                   │                  │        │     │
│  │         └───────────────────▼──────────────────┘        │     │
│  │                      Config Loader                      │     │
│  │                   (Validates & Merges)                  │     │
│  │                             │                            │     │
│  │                             ▼                            │     │
│  │                   InstanceConfig Object                 │     │
│  │              (Type-safe, Singleton)                     │     │
│  └──────────────────────────────┬───────────────────────────┘     │
│                                 │                                 │
│  ┌──────────────────────────────┴─────────────────────┐          │
│  │                                                      │          │
│  ▼                                                      ▼          │
│  ┌─────────────┐      ┌──────────────┐       ┌────────────────┐ │
│  │  Frontend   │◄─────┤  Backend      │       │  Widget        │ │
│  │  (React)    │ HTTP │  (Express)    │       │  (Embedded)    │ │
│  │             │      │               │       │                │ │
│  │ DYNAMIC:    │      │ DYNAMIC:      │       │ DYNAMIC:       │ │
│  │ - Name      │      │ - Git Repo    │       │ - Branding     │ │
│  │ - Logo      │      │ - Prompts     │       │ - Colors       │ │
│  │ - Colors    │      │ - Community   │       │                │ │
│  └─────────────┘      └──────┬────────┘       └────────────────┘ │
│                              │                                    │
│                       ┌──────▼──────┐                             │
│                       │  PostgreSQL  │                             │
│                       │  (Per-Instance)                            │
│                       └──────────────┘                             │
└──────────────────────────────────────────────────────────────────┘

┌────────────────────────┐          ┌────────────────────────┐
│ Project A Instance     │          │ Project B Instance     │
│ projectadocs.example   │          │ projectbdocs.example   │
│ - projecta/docs        │          │ - projectb-docs        │
│ - Project A DB         │          │ - Project B DB         │
└────────────────────────┘          └────────────────────────┘
```

## Design Principles

### 1. Configuration-Driven Design
- All customer-specific values externalized
- No code changes for new deployments
- Single source of truth per instance

### 2. Fail-Fast Validation
- Configuration validated at startup
- Invalid config prevents application start
- Clear error messages guide correction

### 3. Type Safety
- TypeScript interfaces for all config
- Compile-time type checking
- Runtime Zod validation

### 4. Backward Compatibility
- Sensible defaults built-in
- Existing deployments work without changes
- Gradual migration path

### 5. Separation of Concerns
- Configuration layer independent of business logic
- Components consume config, don't load it
- Clear interfaces between layers

## Component Architecture

### Configuration Layer

#### 1. Configuration Loader (`server/config/loader.ts`)

**Responsibilities:**
- Load configuration from multiple sources
- Merge defaults → file → environment variables
- Validate configuration schema
- Provide singleton access

**Key Methods:**
```typescript
class ConfigLoader {
  constructor()                      // Loads and validates config on instantiation
  private loadConfig()               // Orchestrates loading process
  private applyEnvOverrides()        // Applies environment variable overrides
  private mergeDeep()                // Deep merges configuration objects
  public getConfig()                 // Returns complete configuration
  public get<K>(key: K)             // Type-safe access to config sections
}
```

**Configuration Priority:**
1. **Defaults** (hardcoded) - Lowest priority
2. **File** (`config/instance.json`) - Medium priority
3. **Environment Variables** - Highest priority

**Loading Flow:**
```
Startup
   │
   ├─► Load DEFAULT_CONFIG (built-in defaults)
   │
   ├─► Check for config/instance.json
   │   ├─ Exists? → Parse JSON
   │   │            ├─ Valid? → Deep merge with defaults
   │   │            └─ Invalid? → Throw error, fail startup
   │   └─ Not exists? → Continue with defaults
   │
   ├─► Apply Environment Variable Overrides
   │   ├─ PROJECT_NAME → overrides config.project.name
   │   ├─ DOCS_GIT_REPO → overrides config.documentation.gitRepo
   │   └─ ... (all supported env vars)
   │
   ├─► Validate with Zod Schema
   │   ├─ Valid? → Continue startup
   │   └─ Invalid? → Log errors, throw, fail startup
   │
   └─► Create Singleton InstanceConfig
       └─► Export to application
```

#### 2. Configuration Types (`server/config/types.ts`)

**Type Hierarchy:**
```
InstanceConfig
├── ProjectConfig          (name, slug, description, domain)
├── BrandingConfig         (logo, favicon, colors, metaTags)
├── DocumentationConfig    (gitRepo, gitBranch, docsPath, syncEnabled)
├── CommunityConfig        (sources[])
│   └── CommunitySource    (type, enabled, config)
│       ├── ZulipConfig
│       ├── TelegramConfig
│       └── DiscordConfig
├── WidgetConfig          (enabled, domain, branding)
└── AdminConfig           (requireAuth, allowedOrigins)
```

**Zod Validation Schema:**
- Runtime type validation
- Custom error messages
- Regex validation for colors, slugs, URLs
- Required vs optional fields enforcement

### Backend Integration

#### 1. Application Bootstrap (`server/index.ts`)

**Initialization Sequence:**
```
Start Application
   │
   ├─► Load Environment Variables (.env)
   │
   ├─► Initialize ConfigLoader
   │   └─► Validates configuration (may fail fast)
   │
   ├─► Log Instance Information
   │   ├─ Project name
   │   ├─ Documentation repository
   │   └─ Enabled features
   │
   ├─► Initialize Database Connection
   │
   ├─► Setup Routes
   │   └─► Expose /api/config/public
   │
   └─► Start Server
```

**Configuration Access Pattern:**
```typescript
// Import singleton
import { instanceConfig } from './config/loader';

// Direct access (type-safe)
const projectName = instanceConfig.project.name;
const gitRepo = instanceConfig.documentation.gitRepo;
```

#### 2. Public Configuration Endpoint

**Route:** `GET /api/config/public`

**Purpose:** Expose non-sensitive configuration to frontend

**Response Schema:**
```json
{
  "project": {
    "name": "string",
    "slug": "string",
    "description": "string"
  },
  "branding": {
    "logoUrl": "string",
    "faviconUrl": "string",
    "colors": {
      "primary": "string",
      "secondary": "string",
      "accent?": "string"
    },
    "metaTags": {
      "title": "string",
      "description": "string",
      "ogImage?": "string"
    }
  },
  "widget": {
    "enabled": "boolean",
    "domain": "string"
  }
}
```

**Filtering Logic:**
- Exclude sensitive data (API keys, internal configs)
- Expose only UI-relevant configuration
- No authentication required (public endpoint)

#### 3. Component Integration Points

**Git Scraper (`server/scraper/git-scraper.ts`):**
```typescript
// Before: Hardcoded
const gitRepo = "owner/docs";

// After: Configuration-driven
const gitRepo = instanceConfig.documentation.gitRepo;
const branch = instanceConfig.documentation.gitBranch;
const gitUrl = `https://github.com/${gitRepo}`;
```

**Analyzer (`server/analyzer/gemini-analyzer.ts`):**
```typescript
// Before: Hardcoded
const systemPrompt = `You are analyzing Example Project documentation...`;

// After: Configuration-driven
const systemPrompt = `You are analyzing ${instanceConfig.project.name} documentation...`;
```

**Zulip Scraper (`server/scraper/zulipchat.ts`):**
```typescript
// Before: Hardcoded
const zulipDomain = "example.zulipchat.com";

// After: Configuration-driven
const zulipSource = instanceConfig.community.sources.find(
  s => s.type === 'zulip' && s.enabled
);
const zulipDomain = zulipSource?.config.domain;
```

### Frontend Integration

#### 1. Configuration Hook (`client/src/hooks/useInstanceConfig.ts`)

**Architecture:**
```
Component Render
   │
   ├─► useInstanceConfig() hook
   │
   └─► TanStack Query
       │
       ├─► Check cache (queryKey: ['instance-config'])
       │   ├─ Cached? → Return immediately
       │   └─ Not cached? → Fetch from API
       │
       ├─► Fetch /api/config/public
       │   ├─ Success? → Cache with staleTime: Infinity
       │   └─ Error? → Retry with exponential backoff
       │
       └─► Return { data, isLoading, error }
```

**Key Properties:**
- `staleTime: Infinity` - Config never changes during runtime
- Cached at application level (not per component)
- Single fetch per application load
- Type-safe response with TypeScript

#### 2. Component Integration Pattern

**Standard Pattern:**
```typescript
function Component() {
  const { data: config, isLoading } = useInstanceConfig();

  if (isLoading) return <LoadingSpinner />;
  if (!config) return null;

  return (
    <div>
      <h1>{config.project.name}</h1>
      <img src={config.branding.logoUrl} alt="Logo" />
    </div>
  );
}
```

**Affected Components:**
- `Header.tsx` - Project name, logo
- `App.tsx` - Page titles
- `Documentation.tsx` - Meta tags
- `AdminLogin.tsx` - Branding
- `DropdownWidget.tsx` - Widget config

#### 3. Build-Time Configuration (`vite.config.ts`)

**Purpose:** Inject config values into static HTML at build time

**Implementation:**
```typescript
import { configLoader } from './server/config/loader';

export default defineConfig({
  define: {
    // Injected as constants
    'import.meta.env.VITE_PROJECT_NAME': JSON.stringify(config.project.name),
    'import.meta.env.VITE_FAVICON_URL': JSON.stringify(config.branding.faviconUrl),
  },
});
```

**Usage in HTML:**
```html
<title>%VITE_PROJECT_NAME% Documentation</title>
<link rel="icon" href="%VITE_FAVICON_URL%" />
```

### Widget Architecture

**Current Widget Structure:**
```
Widget Embed Code (HTML)
   │
   ├─► Hardcoded domain
   ├─► Hardcoded branding
   └─► Embedded in customer sites
```

**Updated Widget Structure:**
```
Widget Embed Code (HTML)
   │
   ├─► Reads from window.widgetConfig
   │   └─► Server-rendered from instanceConfig
   │
   ├─► Dynamic branding
   │   ├─ Primary color
   │   ├─ Project name
   │   └─ Position
   │
   └─► Embedded in customer sites
```

**Widget Configuration Injection:**
```html
<script>
  window.widgetConfig = {
    primaryColor: '{{ instanceConfig.widget.branding.primaryColor }}',
    projectName: '{{ instanceConfig.project.name }}',
    domain: '{{ instanceConfig.widget.domain }}',
  };
</script>
<script src="/widget.js"></script>
```

## Data Flow

### Configuration Loading (Startup)

```
Server Startup
   │
   ▼
┌────────────────────────┐
│  Load .env file        │
│  (dotenv)              │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  Initialize            │
│  ConfigLoader          │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  Load default config   │
│  (hardcoded default)   │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  Check for             │
│  config/instance.json  │
└───────────┬────────────┘
            │
            ├─► File exists
            │   ├─► Parse JSON
            │   └─► Deep merge with defaults
            │
            └─► File not exists
                └─► Continue with defaults
            │
            ▼
┌────────────────────────┐
│  Apply ENV overrides   │
│  (highest priority)    │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  Validate with Zod     │
│  schema                │
└───────────┬────────────┘
            │
            ├─► Valid
            │   └─► Create singleton
            │       └─► Export to app
            │
            └─► Invalid
                └─► Log errors
                    └─► Throw exception
                        └─► App fails to start
```

### Frontend Configuration Loading

```
User Visits Site
   │
   ▼
React App Loads
   │
   ▼
Component Renders
   │
   ▼
useInstanceConfig() called
   │
   ▼
TanStack Query checks cache
   │
   ├─► Cache hit
   │   └─► Return cached config
   │       └─► Render component
   │
   └─► Cache miss
       │
       ▼
   Fetch /api/config/public
       │
       ├─► Success
       │   └─► Store in cache (staleTime: ∞)
       │       └─► Return config
       │           └─► Render component
       │
       └─► Error
           └─► Retry (exponential backoff)
               └─► Show error state if all retries fail
```

### Configuration Update Flow

```
Admin wants to change configuration
   │
   ▼
Edit config/instance.json or ENV variables
   │
   ▼
Restart application
   │
   ├─► Backend: ConfigLoader reloads
   │   └─► New config validated and applied
   │
   └─► Frontend: Cache invalidated on page refresh
       └─► New config fetched and applied
```

## Security Architecture

### Sensitive Data Handling

**Stored in Environment Variables Only:**
- Database credentials (DATABASE_URL)
- API keys (GOOGLE_AI_API_KEY, OPENAI_API_KEY)
- Admin tokens (ADMIN_TOKEN)
- Zulip API keys (if scraping enabled)

**Stored in Config File (Non-Sensitive):**
- Project metadata
- Branding (logos, colors)
- Public URLs
- Feature flags

**Never Exposed to Frontend:**
- API keys
- Database URLs
- Internal service URLs
- Admin credentials

### Configuration File Security

**Recommended Approach:**
1. `config/instance.example.json` - Committed to Git (example)
2. `config/instance.json` - Gitignored (actual customer config)
3. Environment variables - Never committed

**File Permissions:**
- Config file: Read-only for application user
- No public web access to `/config` directory

### CORS Configuration

**Per-Instance CORS:**
```typescript
{
  admin: {
    allowedOrigins: [
      'https://projectadocs.example',
      'http://localhost:3000'  // Development only
    ]
  }
}
```

## Scalability Considerations

### Performance

**Startup Performance:**
- Config loaded once at startup: ~10ms overhead
- No impact on request latency

**Runtime Performance:**
- Zero overhead (in-memory singleton)
- No file I/O during requests
- Frontend: Single API call, cached forever

### Memory

**Memory Footprint:**
- Configuration object: <10KB in memory
- Negligible impact on server resources

### Scaling Instances

**Horizontal Scaling:**
Each customer instance is independent:
```
Project A Instance (projectadocs.example)
├─ Server 1 (config loaded at start)
├─ Server 2 (config loaded at start)
└─ Server N (config loaded at start)

Project B Instance (projectbdocs.example)
├─ Server 1 (different config loaded at start)
└─ Server 2 (different config loaded at start)
```

No shared state between instances.

## Deployment Architecture

### Deployment Model: One Instance Per Customer

```
┌─────────────────────────────────────────────────────────┐
│                  Deployment Infrastructure               │
│                                                           │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │  Project A Instance  │    │  Project B Instance  │  │
│  │  projectadocs.example│    │  projectbdocs.example│  │
│  │                      │    │                      │  │
│  │  ┌────────────────┐ │    │  ┌────────────────┐ │  │
│  │  │ App Server     │ │    │  │ App Server     │ │  │
│  │  │ + Config       │ │    │  │ + Config       │ │  │
│  │  └────────────────┘ │    │  └────────────────┘ │  │
│  │          │           │    │          │           │  │
│  │  ┌───────▼────────┐ │    │  ┌───────▼────────┐ │  │
│  │  │ PostgreSQL     │ │    │  │ PostgreSQL     │ │  │
│  │  │ (Project A)    │ │    │  │ (Project B)    │ │  │
│  │  └────────────────┘ │    │  └────────────────┘ │  │
│  └──────────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Characteristics:**
- Independent deployments (no shared infrastructure)
- Separate databases (no multi-tenancy)
- Isolated configuration per instance
- Independent scaling per customer

### Deployment Process

**Step-by-Step for New Customer:**

1. **Clone Repository**
   ```bash
   git clone <repo-url>
   cd docpythia
   ```

2. **Create Configuration**
   ```bash
   cp config/instance.example.json config/instance.json
   # Edit config/instance.json with customer values
   ```

3. **Set Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with database, API keys
   ```

4. **Build and Deploy**
   ```bash
   npm install
   npm run build
   npm start
   ```

**Estimated Time:** 15-30 minutes (mostly infrastructure provisioning)

### Infrastructure Requirements Per Instance

**Compute:**
- Application Server: 1-2 vCPU, 2-4GB RAM
- Scales horizontally as needed

**Storage:**
- PostgreSQL: 20GB+ (grows with documentation)
- Application: 1GB (build artifacts)

**Network:**
- Public IP/domain
- HTTPS certificate
- CDN (optional, for static assets)

## Migration Strategy

### Phase 1: Add Configuration Layer (Week 1)

**Objective:** Add configuration system without breaking existing functionality

**Tasks:**
1. Create `server/config/` directory
2. Implement `ConfigLoader` class
3. Define TypeScript interfaces and Zod schemas
4. Add sensible default configuration
5. Create `config/instance.example.json`
6. Write unit tests for config loader

**Risk:** Low (additive changes only)

### Phase 2: Backend Integration (Week 1-2)

**Objective:** Replace hardcoded backend references

**Tasks:**
1. Update `server/index.ts` to load config
2. Expose `/api/config/public` endpoint
3. Update Git scraper to use `config.documentation.gitRepo`
4. Update analyzer prompts to use `config.project.name`
5. Update Zulip scraper to use `config.community.sources`
6. Add integration tests

**Risk:** Medium (affects core functionality)
**Mitigation:** Extensive testing with default config (should behave identically)

### Phase 3: Frontend Integration (Week 2)

**Objective:** Replace hardcoded frontend references

**Tasks:**
1. Create `useInstanceConfig` hook
2. Update Header component
3. Update App component
4. Update index.html meta tags
5. Configure Vite for build-time injection
6. Update all components with hardcoded project references

**Risk:** Medium (UI changes)
**Mitigation:** Visual regression testing

### Phase 4: Widget Integration (Week 2)

**Objective:** Make widget configuration-driven

**Tasks:**
1. Update widget initialization code
2. Inject config into widget embed code
3. Test widget on sample sites

**Risk:** Low (widget is isolated)

### Phase 5: Validation & Testing (Week 3)

**Objective:** Comprehensive testing and documentation

**Tasks:**
1. Comprehensive grep for hardcoded project references
2. Test default configuration (should be identical to current)
3. Test custom configuration end-to-end
4. Load testing with different configs
5. Update deployment documentation
6. Create customer onboarding guide

**Risk:** Low (validation phase)

### Rollback Plan

**If critical issues arise:**
1. Revert to previous Git commit
2. Remove `config/instance.json` (falls back to defaults)
3. Restart application

**No database changes required**, so rollback is safe and fast.

## Monitoring & Observability

### Configuration Validation Monitoring

**At Startup:**
```
2025-10-29 12:00:00 INFO  Configuration loading...
2025-10-29 12:00:00 INFO  ✓ Loaded configuration from config/instance.json
2025-10-29 12:00:00 INFO  ✓ Applied 5 environment variable overrides
2025-10-29 12:00:00 INFO  ✓ Configuration validated for project: Custom Project
2025-10-29 12:00:01 INFO  Server started on port 8080
```

**On Error:**
```
2025-10-29 12:00:00 ERROR Configuration validation failed:
  - project.name: Required field missing
  - branding.colors.primary: Invalid hex color format
2025-10-29 12:00:00 FATAL Failed to start application
```

### Runtime Monitoring

**Key Metrics:**
- `/api/config/public` response time (should be <10ms)
- Configuration cache hit rate (frontend)
- Failed config fetches (frontend errors)

**Alerts:**
- Application fails to start (invalid config)
- `/api/config/public` returns errors

## Testing Strategy

### Unit Tests

**Configuration Loader Tests:**
```typescript
describe('ConfigLoader', () => {
  test('loads default configuration', () => {
    const config = new ConfigLoader().getConfig();
    expect(config.project.name).toBe('DocPythia');
  });

  test('merges config file with defaults', () => {
    // Mock fs.readFileSync to return custom config
    const config = new ConfigLoader().getConfig();
    expect(config.project.name).toBe('Custom Protocol');
  });

  test('environment variables override config file', () => {
    process.env.PROJECT_NAME = 'ENV Protocol';
    const config = new ConfigLoader().getConfig();
    expect(config.project.name).toBe('ENV Protocol');
  });

  test('throws error on invalid configuration', () => {
    // Mock invalid config
    expect(() => new ConfigLoader()).toThrow('Invalid instance configuration');
  });

  test('validates color format', () => {
    // Mock config with invalid color
    expect(() => new ConfigLoader()).toThrow(/Invalid hex color/);
  });
});
```

### Integration Tests

**Backend API Tests:**
```typescript
describe('GET /api/config/public', () => {
  test('returns public configuration', async () => {
    const response = await request(app).get('/api/config/public');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('project');
    expect(response.body).toHaveProperty('branding');
  });

  test('does not expose sensitive data', async () => {
    const response = await request(app).get('/api/config/public');
    expect(response.body).not.toHaveProperty('admin.requireAuth');
  });
});
```

**Frontend Hook Tests:**
```typescript
describe('useInstanceConfig', () => {
  test('fetches and caches configuration', async () => {
    const { result } = renderHook(() => useInstanceConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveProperty('project');
  });

  test('caches configuration indefinitely', async () => {
    const { result, rerender } = renderHook(() => useInstanceConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock API to track calls
    const apiCallCount = jest.fn();

    rerender();

    // Should not make additional API calls
    expect(apiCallCount).toHaveBeenCalledTimes(1);
  });
});
```

### End-to-End Tests

**Default Configuration (Backward Compatibility):**
1. Deploy with no `config/instance.json`
2. Verify default project name appears in header
3. Verify default repository used
4. Verify default branding throughout

**Custom Configuration:**
1. Deploy with custom `config/instance.json`
2. Verify custom name appears in header
3. Verify custom repository used
4. Verify custom branding throughout
5. Verify widget shows custom colors

**Environment Variable Override:**
1. Set `PROJECT_NAME=Test Protocol`
2. Deploy with default config file
3. Verify "Test Protocol" appears (overrides config file)

## Future Enhancements

### Phase 2 Enhancements (Out of Initial Scope)

**1. Admin UI for Configuration**
- Web interface for editing configuration
- Real-time validation
- Preview changes before applying
- Requires database-backed config storage

**2. Configuration Versioning**
- Track configuration changes over time
- Rollback to previous configurations
- Audit log of changes

**3. Multi-Environment Support**
- Different configs for dev/staging/production
- Environment-specific overrides

**4. Customer Self-Service Portal**
- Customers deploy their own instances
- Automated provisioning
- DNS and SSL setup

**5. A/B Testing**
- Test different branding configurations
- Gradual rollout of changes

## Related Documentation

- Story: `/docs/stories/multi-instance-configuration.md`
- Spec: `/docs/specs/multi-instance-configuration.md`
- Tasks: `/docs/tasks/tasks-multi-instance-configuration.md`

## Conclusion

This architecture provides a scalable, maintainable, and secure foundation for multi-customer deployments. The configuration-driven approach eliminates code changes for new customers while maintaining type safety and validation. The phased migration strategy ensures low risk and backward compatibility.

**Key Architectural Benefits:**
- Clean separation of configuration and code
- Type-safe configuration access
- Fail-fast validation
- Zero runtime performance impact
- Simple deployment process
- Independent customer instances
- Future-proof for enhancements
