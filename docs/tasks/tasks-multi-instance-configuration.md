# Tasks: Multi-Instance Customer Configuration System

**Developer:** Wayne
**Date:** 2025-10-29
**Related Story:** `/docs/stories/multi-instance-configuration.md`
**Related Spec:** `/docs/specs/multi-instance-configuration.md`
**Related Architecture:** `/docs/architecture/multi-instance-configuration.md`

## Overview

This task list implements the multi-instance configuration system to transform NearDocsAI into a customer-configurable platform. Tasks are organized by phase and component.

**Estimated Total Time:** 3 weeks (15 working days)

---

## Phase 1: Configuration Layer Foundation (Week 1, Days 1-3)

### Task 1.1: Create Configuration Structure
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** None

- [ ] Create `/root/src/lionscraft-NearDocsAI/server/config/` directory
- [ ] Create `/root/src/lionscraft-NearDocsAI/config/` directory (for instance.json)
- [ ] Create `server/config/types.ts` with all TypeScript interfaces:
  - `InstanceConfig`
  - `ProjectConfig`
  - `BrandingConfig`
  - `DocumentationConfig`
  - `CommunityConfig`
  - `CommunitySource`
  - `ZulipConfig`, `TelegramConfig`, `DiscordConfig`
  - `WidgetConfig`
  - `AdminConfig`

### Task 1.2: Implement Configuration Loader
**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** Task 1.1

- [ ] Create `server/config/loader.ts`
- [ ] Implement `ConfigLoader` class with methods:
  - `constructor()` - Initialize and load config
  - `loadConfig()` - Orchestrate loading from sources
  - `applyEnvOverrides()` - Apply environment variable overrides
  - `mergeDeep()` - Deep merge configuration objects
  - `getConfig()` - Return full configuration
  - `get<K>(key: K)` - Type-safe section access
- [ ] Define `DEFAULT_CONFIG` with NEAR values:
  - Project: "NEAR Protocol", slug "near"
  - Branding: NEAR logo, colors (#00C1DE)
  - Documentation: near/docs repo
  - Community: Zulip near.zulipchat.com
  - Widget: Current widget config
- [ ] Implement singleton pattern
- [ ] Export `configLoader` and `instanceConfig`

### Task 1.3: Add Zod Validation Schema
**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** Task 1.1, 1.2

- [ ] Install `zod` if not already installed: `npm install zod`
- [ ] Create `InstanceConfigSchema` with Zod:
  - Required field validation
  - Regex validation for:
    - Colors: `/^#[0-9A-Fa-f]{6}$/`
    - Slug: `/^[a-z0-9-]+$/`
    - URLs: `z.string().url()`
  - Nested object validation
  - Optional field handling
- [ ] Integrate schema validation in `loadConfig()`
- [ ] Add error handling with clear messages

### Task 1.4: Create Configuration Files
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 1.1

- [ ] Create `config/instance.example.json` with NEAR example
- [ ] Create `.gitignore` entry for `config/instance.json`
- [ ] Update `.env.example` with new environment variables:
  - `PROJECT_NAME`
  - `PROJECT_SLUG`
  - `PROJECT_DESCRIPTION`
  - `PROJECT_DOMAIN`
  - `BRANDING_LOGO_URL`
  - `BRANDING_FAVICON_URL`
  - `BRANDING_PRIMARY_COLOR`
  - `BRANDING_SECONDARY_COLOR`
  - `DOCS_GIT_REPO`
  - `DOCS_GIT_BRANCH`
  - `DOCS_PATH`
  - `DOCS_SYNC_ENABLED`
  - `WIDGET_PRIMARY_COLOR`
- [ ] Add comments explaining each variable

### Task 1.5: Write Configuration Unit Tests
**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** Task 1.2, 1.3

- [ ] Create `server/config/loader.test.ts`
- [ ] Test default configuration loads correctly
- [ ] Test JSON file parsing and merging
- [ ] Test environment variable overrides
- [ ] Test validation errors for:
  - Missing required fields
  - Invalid color formats
  - Invalid slug format
  - Invalid URLs
- [ ] Test singleton pattern works
- [ ] Test type-safe access methods
- [ ] Achieve >90% test coverage

---

## Phase 2: Backend Integration (Week 1-2, Days 4-8)

### Task 2.1: Integrate Configuration into Server Bootstrap
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** Task 1.2

- [ ] Update `server/index.ts`:
  - Import `configLoader` and `instanceConfig` at top
  - Add config loading before database connection
  - Add startup logging:
    ```
    === Instance Configuration ===
    Project: <name>
    Docs Repo: <repo>
    ==============================
    ```
  - Handle configuration loading errors (fail fast)

### Task 2.2: Create Public Configuration API Endpoint
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** Task 2.1

- [ ] Update `server/routes.ts`:
  - Add `GET /api/config/public` route
  - Return public-safe configuration:
    - `project` (full object)
    - `branding` (full object)
    - `widget.enabled` and `widget.domain`
  - Exclude sensitive data (admin config, API keys)
  - Add response type definition
  - No authentication required

### Task 2.3: Update Git Scraper Configuration
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 2.1

- [ ] Locate Git scraper file (check `server/scraper/`, `server/routes.ts`)
- [ ] Replace hardcoded `near/docs` with:
  ```typescript
  const gitRepo = instanceConfig.documentation.gitRepo;
  const branch = instanceConfig.documentation.gitBranch;
  const gitUrl = `https://github.com/${gitRepo}`;
  ```
- [ ] Update any path handling to use `config.documentation.docsPath`
- [ ] Test with NEAR config (should work identically)

### Task 2.4: Update Analyzer Prompts
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 2.1

- [ ] Update `server/analyzer/gemini-analyzer.ts`:
  - Find all references to "NEAR Protocol" in prompts
  - Replace with `${instanceConfig.project.name}`
  - Example:
    ```typescript
    const prompt = `You are analyzing messages from ${instanceConfig.project.name}'s validator community...`;
    ```
- [ ] Update `server/test-analyzer.ts` if it has hardcoded references
- [ ] Verify prompts are grammatically correct with variable names

### Task 2.5: Update Zulip Scraper Configuration
**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** Task 2.1

- [ ] Update `server/scraper/zulipchat.ts`:
  - Find Zulip configuration source
  - Replace hardcoded domain/channel with:
    ```typescript
    const zulipSource = instanceConfig.community.sources.find(
      s => s.type === 'zulip' && s.enabled
    );
    if (!zulipSource) {
      console.log('Zulip scraping disabled');
      return;
    }
    const config = zulipSource.config as ZulipConfig;
    const domain = config.domain;
    const channel = config.channel;
    ```
- [ ] Handle case where Zulip is disabled
- [ ] Update environment variable reading for `ZULIP_CHANNEL`

### Task 2.6: Update Widget Routes
**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** Task 2.1

- [ ] Update `server/routes.ts` widget endpoints:
  - Find widget HTML generation code
  - Replace "NEAR" references with `${instanceConfig.project.name}`
  - Replace hardcoded colors with `${instanceConfig.widget.branding.primaryColor}`
  - Update widget demo page title and content
  - Update placeholder text:
    ```typescript
    placeholder="Ask me anything about ${instanceConfig.project.name}..."
    ```
  - Update suggestion buttons to be generic or config-driven

### Task 2.7: Update Seed Data (Optional)
**Estimated Time:** 1 hour
**Priority:** Low
**Dependencies:** Task 2.1

- [ ] Review `server/seed.ts`:
  - Current seed data is NEAR-specific
  - Decision: Keep as NEAR example or make generic?
  - Option 1: Keep NEAR seed, only run if config is NEAR
  - Option 2: Create generic seed data
  - Update seed script accordingly

### Task 2.8: Update Helper Scripts
**Estimated Time:** 1 hour
**Priority:** Low
**Dependencies:** Task 2.1

- [ ] Update `server/scripts/analyze-messages.ts`:
  - Replace "NEAR Validator Docs" in banner with config value
- [ ] Update `server/scripts/full-scrape.ts`:
  - Replace "NEAR Validator Docs" in banner with config value
- [ ] Update `server/scripts/import-near-nodes-content.ts`:
  - This is NEAR-specific import, leave as-is (it's a one-time script)
  - Add comment noting it's NEAR-specific

### Task 2.9: Backend Integration Tests
**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** All Phase 2 tasks

- [ ] Create integration tests:
  - Test `/api/config/public` returns correct data
  - Test `/api/config/public` doesn't expose sensitive data
  - Test Git scraper uses correct repository
  - Test analyzer prompts contain correct project name
  - Test widget HTML contains correct branding
- [ ] Test with both NEAR and mock Conflux configuration
- [ ] Verify no hardcoded "NEAR" in dynamic content

---

## Phase 3: Frontend Integration (Week 2, Days 9-12)

### Task 3.1: Create Frontend Configuration Hook
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** Task 2.2

- [ ] Create `client/src/hooks/useInstanceConfig.ts`
- [ ] Define `PublicConfig` TypeScript interface matching backend response
- [ ] Implement `useInstanceConfig` using TanStack Query:
  - Query key: `['instance-config']`
  - Fetch from `/api/config/public`
  - `staleTime: Infinity` (config doesn't change at runtime)
  - Error handling with retry
- [ ] Export hook for use in components

### Task 3.2: Create Frontend Configuration Types
**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** Task 3.1

- [ ] Create `client/src/types/config.ts`
- [ ] Define frontend-specific types:
  - `PublicConfig`
  - `ProjectConfig`
  - `BrandingConfig`
  - `WidgetConfig`
- [ ] Ensure types match backend public endpoint response

### Task 3.3: Update Header Component
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 3.1

- [ ] Update `client/src/components/Header.tsx`:
  - Import and use `useInstanceConfig()` hook
  - Replace hardcoded logo path with `config.branding.logoUrl`
  - Replace "NEAR Logo" alt text with `${config.project.name} Logo`
  - Replace "Knowledge for NEAR Operations & Workflows" with `${config.project.description}` or generic text
  - Add loading state while config fetches
  - Handle null config gracefully

### Task 3.4: Update App Component
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 3.1

- [ ] Update `client/src/App.tsx`:
  - Import `useInstanceConfig()` hook
  - Update page titles to use `${config.branding.metaTags.title}`
  - Update any hardcoded "NEAR" references
  - Consider using React Helmet for dynamic meta tags

### Task 3.5: Update HTML Template
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 3.1

- [ ] Update `client/index.html`:
  - Use Vite environment variables for static meta tags:
    - `<title>%VITE_PROJECT_NAME% Documentation</title>`
    - `<meta name="description" content="%VITE_PROJECT_DESCRIPTION%">`
    - `<link rel="icon" href="%VITE_FAVICON_URL%">`
  - Add Open Graph tags if needed

### Task 3.6: Configure Vite for Build-Time Injection
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** Task 3.5

- [ ] Update `vite.config.ts`:
  - Import `configLoader` from server
  - Use `define` to inject environment variables:
    ```typescript
    define: {
      'import.meta.env.VITE_PROJECT_NAME': JSON.stringify(config.project.name),
      'import.meta.env.VITE_PROJECT_DESCRIPTION': JSON.stringify(config.project.description),
      'import.meta.env.VITE_FAVICON_URL': JSON.stringify(config.branding.faviconUrl),
    }
    ```
  - Handle ESM import of TypeScript server files
  - Test build process works

### Task 3.7: Update Documentation Components
**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** Task 3.1

- [ ] Update `client/src/pages/Documentation.tsx`:
  - Replace any hardcoded "NEAR" references with config
  - Update page title and metadata
- [ ] Review and update:
  - `client/src/components/DocContent.tsx`
  - `client/src/components/NodeTypeCard.tsx`
  - `client/src/components/StatsCard.tsx`
  - Any other components with hardcoded protocol names

### Task 3.8: Update Admin Components
**Estimated Time:** 1 hour
**Priority:** Medium
**Dependencies:** Task 3.1

- [ ] Update `client/src/pages/Admin.tsx`:
  - Use config for branding
  - Update any "NEAR" specific text
- [ ] Update `client/src/pages/AdminLogin.tsx`:
  - Use config for logo and branding
  - Update page title

### Task 3.9: Update Example Components
**Estimated Time:** 1 hour
**Priority:** Low
**Dependencies:** Task 3.1

- [ ] Update `client/src/components/examples/Header.tsx`
- [ ] Update `client/src/components/examples/DocContent.tsx`:
  - Replace "NEAR validator node" with generic text or config-driven
- [ ] Update `client/src/components/examples/NodeTypeCard.tsx`:
  - Replace "NEAR network" with `${config.project.name} network`

### Task 3.10: Frontend Integration Tests
**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** All Phase 3 tasks

- [ ] Write tests for `useInstanceConfig` hook:
  - Test fetching configuration
  - Test caching behavior
  - Test error handling
- [ ] Write component tests:
  - Header displays correct logo and name
  - App uses correct titles
  - Components handle loading state
- [ ] Visual regression tests (optional):
  - Screenshot NEAR configuration
  - Screenshot Conflux configuration
  - Compare for correctness

---

## Phase 4: Widget Integration (Week 2, Days 12-13)

### Task 4.1: Update Widget HTML Generation
**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** Task 2.6

- [ ] Locate widget HTML generation in `server/routes.ts`
- [ ] Update widget initialization to inject config:
  ```html
  <script>
    window.widgetConfig = {
      primaryColor: '{{ config.widget.branding.primaryColor }}',
      projectName: '{{ config.project.name }}',
      domain: '{{ config.widget.domain }}',
    };
  </script>
  ```
- [ ] Update widget CSS to use `var(--widget-primary-color)`
- [ ] Make widget title dynamic: `${projectName} Help`

### Task 4.2: Update Widget Styling
**Estimated Time:** 1 hour
**Priority:** Medium
**Dependencies:** Task 4.1

- [ ] Update widget CSS variables:
  - Replace hardcoded NEAR color with config value
  - Support dynamic positioning (bottom-right/bottom-left)
- [ ] Test widget with different colors and positions

### Task 4.3: Update Widget Demo Page
**Estimated Time:** 1 hour
**Priority:** Low
**Dependencies:** Task 4.1

- [ ] Update demo page content to be generic
- [ ] Replace "NEAR Protocol" with config values
- [ ] Test widget demo with multiple configurations

---

## Phase 5: Comprehensive Testing & Validation (Week 3, Days 14-15)

### Task 5.1: Find All Hardcoded NEAR References
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** All previous tasks

- [ ] Run comprehensive grep for "NEAR":
  ```bash
  grep -r "NEAR" --include="*.ts" --include="*.tsx" --include="*.html" server/ client/
  ```
- [ ] Exclude:
  - `node_modules/`
  - Test data files
  - Comment-only references
  - Script files that are intentionally NEAR-specific
- [ ] Document remaining references and determine if they need updating
- [ ] Create checklist of files to update
- [ ] Update all identified files

### Task 5.2: Test NEAR Configuration (Default)
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** Task 5.1

- [ ] Deploy application with no `config/instance.json`
- [ ] Verify application starts successfully
- [ ] Verify startup logs show "NEAR Protocol"
- [ ] Test frontend:
  - [ ] Header shows NEAR logo
  - [ ] Title is "NEAR Protocol Documentation"
  - [ ] Correct favicon
  - [ ] Meta tags correct
- [ ] Test backend:
  - [ ] `/api/config/public` returns NEAR config
  - [ ] Git scraper uses `near/docs`
  - [ ] Analyzer prompts mention "NEAR Protocol"
- [ ] Test widget:
  - [ ] Widget shows NEAR branding
  - [ ] Widget title is "NEAR Help"

### Task 5.3: Create Conflux Configuration
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** None (can be done in parallel)

- [ ] Create `config/conflux-instance.json`:
  ```json
  {
    "project": {
      "name": "Conflux Protocol",
      "slug": "conflux",
      "description": "Conflux Protocol Documentation Hub",
      "domain": "confluxdocs.ai"
    },
    "branding": {
      "logoUrl": "https://confluxnetwork.org/logo.svg",
      "faviconUrl": "/favicon-conflux.ico",
      "colors": {
        "primary": "#FF6B00",
        "secondary": "#1A1A1A"
      },
      "metaTags": {
        "title": "Conflux Protocol Documentation",
        "description": "Comprehensive documentation for Conflux Protocol"
      }
    },
    "documentation": {
      "gitRepo": "conflux-chain/conflux-docs",
      "gitBranch": "main",
      "docsPath": "/",
      "syncEnabled": true
    },
    "community": {
      "sources": [
        {
          "type": "discord",
          "enabled": true,
          "config": {
            "serverId": "conflux-server-id",
            "channelId": "support-channel-id"
          }
        }
      ]
    },
    "widget": {
      "enabled": true,
      "domain": "https://confluxdocs.ai",
      "branding": {
        "primaryColor": "#FF6B00",
        "position": "bottom-right"
      }
    },
    "admin": {
      "requireAuth": true,
      "allowedOrigins": ["https://confluxdocs.ai"]
    }
  }
  ```

### Task 5.4: Test Conflux Configuration
**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** Task 5.3

- [ ] Copy Conflux config to `config/instance.json`
- [ ] Restart application
- [ ] Verify startup logs show "Conflux Protocol"
- [ ] Test frontend:
  - [ ] Header shows Conflux logo (if available, or placeholder)
  - [ ] Title is "Conflux Protocol Documentation"
  - [ ] Correct favicon
  - [ ] Meta tags correct
  - [ ] Primary color is Conflux orange (#FF6B00)
- [ ] Test backend:
  - [ ] `/api/config/public` returns Conflux config
  - [ ] Git scraper uses `conflux-chain/conflux-docs`
  - [ ] Analyzer prompts mention "Conflux Protocol"
  - [ ] Zulip scraper disabled (no Zulip in Conflux config)
- [ ] Test widget:
  - [ ] Widget shows Conflux branding
  - [ ] Widget title is "Conflux Help"
  - [ ] Widget color is orange

### Task 5.5: Test Environment Variable Overrides
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 5.2

- [ ] Set environment variable: `PROJECT_NAME="Test Protocol"`
- [ ] Keep NEAR config file in place
- [ ] Restart application
- [ ] Verify "Test Protocol" appears in header (overrides config file)
- [ ] Verify other config values unchanged
- [ ] Test priority: ENV > File > Defaults

### Task 5.6: Test Configuration Validation
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 5.3

- [ ] Test invalid configurations:
  - [ ] Missing required field (e.g., remove `project.name`)
  - [ ] Invalid color format (e.g., `"primary": "red"`)
  - [ ] Invalid slug (e.g., `"slug": "My Protocol"`)
  - [ ] Invalid URL format
- [ ] Verify application fails to start with clear error message
- [ ] Verify error message identifies the problem field
- [ ] Test each validation rule

### Task 5.7: Test Widget on External Site
**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** Task 4.3

- [ ] Create simple HTML page to embed widget
- [ ] Test with NEAR configuration
- [ ] Test with Conflux configuration
- [ ] Verify branding changes correctly
- [ ] Test widget functionality (if implemented)

### Task 5.8: Performance Testing
**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** Task 5.2, 5.4

- [ ] Measure application startup time with config loading
- [ ] Verify startup overhead is <50ms
- [ ] Measure `/api/config/public` response time (should be <10ms)
- [ ] Test frontend config caching (should only fetch once)
- [ ] Run load test with multiple configurations

---

## Phase 6: Documentation & Deployment (Week 3, Days 15)

### Task 6.1: Update Project Documentation
**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** All previous tasks

- [ ] Update `README.md`:
  - Add section on multi-instance configuration
  - Explain deployment process
  - Link to configuration documentation
- [ ] Create `docs/CONFIGURATION.md`:
  - Document all configuration fields
  - Provide examples for NEAR and Conflux
  - Explain priority (ENV > File > Defaults)
  - List all environment variables
  - Provide troubleshooting guide
- [ ] Update `docs/DEPLOYMENT.md` (or create if missing):
  - Step-by-step deployment for new customer
  - Configuration checklist
  - Testing checklist

### Task 6.2: Create Deployment Guide
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** Task 6.1

- [ ] Create `docs/CUSTOMER_DEPLOYMENT.md`:
  - Prerequisites checklist
  - Infrastructure requirements
  - Configuration steps
  - Deployment commands
  - Verification steps
  - Troubleshooting common issues
- [ ] Include examples for:
  - NEAR deployment (default)
  - Conflux deployment
  - Custom protocol deployment

### Task 6.3: Update Environment Variable Documentation
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 6.1

- [ ] Update `.env.example`:
  - Add all new variables with descriptions
  - Provide example values
  - Mark required vs optional
  - Group related variables
- [ ] Ensure documentation matches implementation

### Task 6.4: Create Configuration Examples
**Estimated Time:** 1 hour
**Priority:** Medium
**Dependencies:** Task 5.3

- [ ] Create `config/examples/` directory
- [ ] Add example configurations:
  - `near-instance.json` (NEAR example)
  - `conflux-instance.json` (Conflux example)
  - `minimal-instance.json` (minimal required fields)
  - `full-instance.json` (all possible fields)

### Task 6.5: Update CLAUDE.md
**Estimated Time:** 30 minutes
**Priority:** Medium
**Dependencies:** Task 6.1

- [ ] Update project description in `CLAUDE.md`:
  - Note: Now a multi-instance platform
  - Support for multiple blockchain protocols
  - Configuration-driven deployment
- [ ] Update development standards if needed

---

## Phase 7: Final Validation & Handoff (Week 3, Day 15)

### Task 7.1: Final Code Review
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** All previous tasks

- [ ] Self-review all changed files
- [ ] Verify no debug code or console.logs
- [ ] Verify all TypeScript types are correct
- [ ] Verify all tests pass
- [ ] Check for code duplication
- [ ] Ensure consistent code style

### Task 7.2: Create Conflux Deployment for Wayne
**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** Task 5.3, 6.2

- [ ] Create Conflux configuration for Wayne's use
- [ ] Test deployment locally
- [ ] Document any Conflux-specific notes
- [ ] Provide Wayne with:
  - Conflux config file
  - Deployment instructions
  - Testing checklist

### Task 7.3: Verify All Success Criteria
**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** All previous tasks

- [ ] Configuration loader implemented with validation ✓
- [ ] Default NEAR configuration backward compatible ✓
- [ ] Environment variable overrides working ✓
- [ ] `/api/config/public` endpoint functional ✓
- [ ] Frontend `useInstanceConfig` hook implemented ✓
- [ ] All hardcoded "NEAR" references replaced ✓
- [ ] Header uses config for logo and name ✓
- [ ] Git scraper uses config for repository URL ✓
- [ ] Analyzer uses config for project name in prompts ✓
- [ ] Widget uses config for branding ✓
- [ ] Conflux configuration tested end-to-end ✓
- [ ] Documentation updated with examples ✓
- [ ] Zero code changes required for new deployments ✓

### Task 7.4: Create Feature Branch
**Estimated Time:** 5 minutes
**Priority:** High
**Dependencies:** None (should be done first)

- [ ] Create feature branch from `main`:
  ```bash
  git checkout -b feature/multi-instance-configuration
  ```
- [ ] Ensure all work is done on this branch
- [ ] Keep branch up to date with main

### Task 7.5: Commit Changes
**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** Task 7.1

- [ ] Stage all changes:
  ```bash
  git add .
  ```
- [ ] Create comprehensive commit message:
  ```
  Add multi-instance customer configuration system

  - Implement configuration loader with Zod validation
  - Add support for environment variables and JSON config file
  - Replace all hardcoded NEAR references with config values
  - Add public configuration API endpoint
  - Update frontend to consume configuration dynamically
  - Update widget to support custom branding
  - Add comprehensive tests for configuration system
  - Create deployment documentation and examples
  - Support both NEAR (default) and Conflux configurations

  Related Story: /docs/stories/multi-instance-configuration.md
  Related Spec: /docs/specs/multi-instance-configuration.md
  Related Architecture: /docs/architecture/multi-instance-configuration.md

  Developer: Wayne
  ```
- [ ] Push to remote:
  ```bash
  git push -u origin feature/multi-instance-configuration
  ```

### Task 7.6: Create Pull Request
**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** Task 7.5

- [ ] Create PR from `feature/multi-instance-configuration` to `main`
- [ ] PR Title: "Multi-Instance Customer Configuration System"
- [ ] PR Description:
  - Summary of changes
  - Link to story, spec, architecture docs
  - Testing performed
  - Screenshots of NEAR vs Conflux
  - Deployment notes
- [ ] Request review
- [ ] Address review feedback

---

## Summary Statistics

**Total Tasks:** 73
**Estimated Total Time:** ~80 hours (2 weeks of focused work)
**High Priority Tasks:** 45
**Medium Priority Tasks:** 20
**Low Priority Tasks:** 8

**Critical Path:**
1. Configuration Layer (Tasks 1.1 - 1.5)
2. Backend Integration (Tasks 2.1 - 2.6)
3. Frontend Integration (Tasks 3.1 - 3.6)
4. Testing & Validation (Tasks 5.1 - 5.6)
5. Documentation (Tasks 6.1 - 6.3)

**Can Be Done in Parallel:**
- Task 5.3 (Create Conflux config) can be done anytime
- Task 1.5 (Config unit tests) can overlap with Task 2.1
- Task 3.10 (Frontend tests) can be done as components are updated
- Documentation tasks can be done throughout

## Files Created/Modified Summary

### New Files Created
- `server/config/types.ts`
- `server/config/loader.ts`
- `server/config/loader.test.ts`
- `config/instance.example.json`
- `config/examples/near-instance.json`
- `config/examples/conflux-instance.json`
- `config/examples/minimal-instance.json`
- `config/examples/full-instance.json`
- `client/src/hooks/useInstanceConfig.ts`
- `client/src/types/config.ts`
- `docs/CONFIGURATION.md`
- `docs/CUSTOMER_DEPLOYMENT.md`

### Files Modified
- `.env.example`
- `.gitignore`
- `server/index.ts`
- `server/routes.ts`
- `server/analyzer/gemini-analyzer.ts`
- `server/scraper/zulipchat.ts`
- `server/seed.ts` (optional)
- `server/scripts/analyze-messages.ts`
- `server/scripts/full-scrape.ts`
- `client/index.html`
- `client/src/App.tsx`
- `client/src/components/Header.tsx`
- `client/src/pages/Admin.tsx`
- `client/src/pages/AdminLogin.tsx`
- `client/src/pages/Documentation.tsx`
- `client/src/components/examples/*.tsx` (multiple)
- `vite.config.ts`
- `README.md`
- `CLAUDE.md`

## Risk Mitigation Checklist

- [ ] All tests pass before deployment
- [ ] Backward compatibility verified (NEAR config works without changes)
- [ ] Configuration validation prevents invalid deployments
- [ ] Documentation complete and accurate
- [ ] Rollback plan documented and tested
- [ ] Wayne's immediate Conflux need addressed

## Next Steps After Task Completion

1. **Review Task List** - Wayne reviews and approves task breakdown
2. **Create Feature Branch** - `feature/multi-instance-configuration`
3. **Begin Implementation** - Start with Phase 1 (Configuration Layer)
4. **Incremental Testing** - Test each phase before moving to next
5. **Documentation Throughout** - Update docs as features are completed
6. **Final Validation** - Comprehensive testing with both NEAR and Conflux
7. **Deploy to Staging** - Test in staging environment
8. **Production Deployment** - Deploy to production after approval
9. **Monitor** - Watch for any configuration-related issues

## Success Criteria Checklist

- [ ] Wayne can deploy Conflux instance by changing configuration only
- [ ] No code modifications required for new deployments
- [ ] All hardcoded "NEAR" references eliminated from dynamic content
- [ ] Configuration validation catches errors at startup
- [ ] Type-safe configuration access throughout codebase
- [ ] Comprehensive documentation for future deployments
- [ ] Time to deploy new customer: <30 minutes
