# Specification: Multi-Instance Customer Configuration System

**Developer:** Wayne
**Date:** 2025-10-29
**Related Story:** `/docs/stories/multi-instance-configuration.md`
**Related Architecture:** `/docs/architecture/multi-instance-configuration.md`

## Overview

Transform NearDocsAI from a NEAR-specific application into a multi-customer platform where each protocol (NEAR, Conflux, etc.) receives an independent deployment with custom configuration. Configuration will be managed through environment variables and a JSON configuration file, loaded at startup.

## Technical Approach

### Configuration Strategy

**Three-Layer Configuration:**
1. **Default Configuration** - Hardcoded NEAR defaults (backward compatibility)
2. **Configuration File** - `config/instance.json` for complex structures
3. **Environment Variables** - Override config file values

**Loading Priority:** Environment Variables > Config File > Defaults

### Configuration Schema

#### Instance Configuration File (`config/instance.json`)

```typescript
interface InstanceConfig {
  project: ProjectConfig;
  branding: BrandingConfig;
  documentation: DocumentationConfig;
  community: CommunityConfig;
  widget: WidgetConfig;
  admin: AdminConfig;
}

interface ProjectConfig {
  name: string;                    // e.g., "NEAR Protocol", "Conflux"
  slug: string;                    // e.g., "near", "conflux" (URL-safe)
  description: string;             // Project tagline
  domain: string;                  // e.g., "neardocs.ai"
}

interface BrandingConfig {
  logoUrl: string;                 // Full URL or path to logo
  faviconUrl: string;              // Full URL or path to favicon
  colors: {
    primary: string;               // Hex color
    secondary: string;             // Hex color
    accent?: string;               // Optional accent color
  };
  metaTags: {
    title: string;                 // Browser title
    description: string;           // Meta description
    ogImage?: string;              // Open Graph image URL
  };
}

interface DocumentationConfig {
  gitRepo: string;                 // e.g., "near/docs", "conflux-chain/conflux-docs"
  gitBranch: string;               // default: "main"
  docsPath: string;                // Path within repo, default: "/"
  syncEnabled: boolean;            // Enable auto-sync
}

interface CommunityConfig {
  sources: CommunitySource[];
}

interface CommunitySource {
  type: 'zulip' | 'telegram' | 'discord';
  enabled: boolean;
  config: ZulipConfig | TelegramConfig | DiscordConfig;
}

interface ZulipConfig {
  domain: string;                  // e.g., "near.zulipchat.com"
  channel: string;                 // e.g., "community-support"
  apiKey?: string;                 // If scraping enabled
}

interface TelegramConfig {
  channelId: string;
  channelName: string;
}

interface DiscordConfig {
  serverId: string;
  channelId: string;
}

interface WidgetConfig {
  enabled: boolean;
  domain: string;                  // Where widget is hosted
  branding: {
    primaryColor: string;
    position: 'bottom-right' | 'bottom-left';
  };
}

interface AdminConfig {
  requireAuth: boolean;
  allowedOrigins: string[];        // CORS origins
}
```

#### Environment Variable Mapping

```bash
# Project Configuration
PROJECT_NAME="NEAR Protocol"
PROJECT_SLUG="near"
PROJECT_DESCRIPTION="NEAR Protocol Documentation Hub"
PROJECT_DOMAIN="neardocs.ai"

# Branding
BRANDING_LOGO_URL="https://near.org/logo.svg"
BRANDING_FAVICON_URL="/favicon.ico"
BRANDING_PRIMARY_COLOR="#00C1DE"
BRANDING_SECONDARY_COLOR="#000000"

# Documentation
DOCS_GIT_REPO="near/docs"
DOCS_GIT_BRANCH="main"
DOCS_PATH="/"
DOCS_SYNC_ENABLED="true"

# Community - Zulip
COMMUNITY_ZULIP_ENABLED="true"
COMMUNITY_ZULIP_DOMAIN="near.zulipchat.com"
COMMUNITY_ZULIP_CHANNEL="community-support"

# Widget
WIDGET_ENABLED="true"
WIDGET_DOMAIN="https://experthub.lionscraft.io"
WIDGET_PRIMARY_COLOR="#00C1DE"

# Admin
ADMIN_REQUIRE_AUTH="true"
```

### Implementation Components

#### 1. Configuration Loader (`server/config/loader.ts`)

```typescript
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Zod schema for validation
const InstanceConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string(),
    domain: z.string().url(),
  }),
  branding: z.object({
    logoUrl: z.string(),
    faviconUrl: z.string(),
    colors: z.object({
      primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }),
    metaTags: z.object({
      title: z.string(),
      description: z.string(),
      ogImage: z.string().optional(),
    }),
  }),
  documentation: z.object({
    gitRepo: z.string(),
    gitBranch: z.string().default('main'),
    docsPath: z.string().default('/'),
    syncEnabled: z.boolean().default(true),
  }),
  community: z.object({
    sources: z.array(z.object({
      type: z.enum(['zulip', 'telegram', 'discord']),
      enabled: z.boolean(),
      config: z.any(), // Specific validation per type
    })),
  }),
  widget: z.object({
    enabled: z.boolean(),
    domain: z.string(),
    branding: z.object({
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      position: z.enum(['bottom-right', 'bottom-left']),
    }),
  }),
  admin: z.object({
    requireAuth: z.boolean(),
    allowedOrigins: z.array(z.string()),
  }),
});

// Default NEAR configuration
const DEFAULT_CONFIG: InstanceConfig = {
  project: {
    name: 'NEAR Protocol',
    slug: 'near',
    description: 'NEAR Protocol Documentation Hub',
    domain: 'neardocs.ai',
  },
  branding: {
    logoUrl: 'https://near.org/logo.svg',
    faviconUrl: '/favicon.ico',
    colors: {
      primary: '#00C1DE',
      secondary: '#000000',
    },
    metaTags: {
      title: 'NEAR Protocol Documentation',
      description: 'Comprehensive documentation for NEAR Protocol',
    },
  },
  documentation: {
    gitRepo: 'near/docs',
    gitBranch: 'main',
    docsPath: '/',
    syncEnabled: true,
  },
  community: {
    sources: [
      {
        type: 'zulip',
        enabled: true,
        config: {
          domain: 'near.zulipchat.com',
          channel: 'community-support',
        },
      },
    ],
  },
  widget: {
    enabled: true,
    domain: process.env.WIDGET_DOMAIN || 'https://experthub.lionscraft.io',
    branding: {
      primaryColor: '#00C1DE',
      position: 'bottom-right',
    },
  },
  admin: {
    requireAuth: true,
    allowedOrigins: ['http://localhost:3000'],
  },
};

export class ConfigLoader {
  private config: InstanceConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): InstanceConfig {
    // 1. Start with defaults
    let config = { ...DEFAULT_CONFIG };

    // 2. Load from config file if exists
    const configPath = path.join(process.cwd(), 'config', 'instance.json');
    if (fs.existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config = this.mergeDeep(config, fileConfig);
        console.log('✓ Loaded configuration from config/instance.json');
      } catch (error) {
        console.error('Failed to parse config/instance.json:', error);
        throw new Error('Invalid configuration file');
      }
    }

    // 3. Override with environment variables
    config = this.applyEnvOverrides(config);

    // 4. Validate final configuration
    try {
      const validated = InstanceConfigSchema.parse(config);
      console.log(`✓ Configuration validated for project: ${validated.project.name}`);
      return validated;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw new Error('Invalid instance configuration');
    }
  }

  private applyEnvOverrides(config: InstanceConfig): InstanceConfig {
    const env = process.env;

    // Project overrides
    if (env.PROJECT_NAME) config.project.name = env.PROJECT_NAME;
    if (env.PROJECT_SLUG) config.project.slug = env.PROJECT_SLUG;
    if (env.PROJECT_DESCRIPTION) config.project.description = env.PROJECT_DESCRIPTION;
    if (env.PROJECT_DOMAIN) config.project.domain = env.PROJECT_DOMAIN;

    // Branding overrides
    if (env.BRANDING_LOGO_URL) config.branding.logoUrl = env.BRANDING_LOGO_URL;
    if (env.BRANDING_FAVICON_URL) config.branding.faviconUrl = env.BRANDING_FAVICON_URL;
    if (env.BRANDING_PRIMARY_COLOR) config.branding.colors.primary = env.BRANDING_PRIMARY_COLOR;
    if (env.BRANDING_SECONDARY_COLOR) config.branding.colors.secondary = env.BRANDING_SECONDARY_COLOR;

    // Documentation overrides
    if (env.DOCS_GIT_REPO) config.documentation.gitRepo = env.DOCS_GIT_REPO;
    if (env.DOCS_GIT_BRANCH) config.documentation.gitBranch = env.DOCS_GIT_BRANCH;
    if (env.DOCS_PATH) config.documentation.docsPath = env.DOCS_PATH;
    if (env.DOCS_SYNC_ENABLED !== undefined) {
      config.documentation.syncEnabled = env.DOCS_SYNC_ENABLED === 'true';
    }

    // Widget overrides
    if (env.WIDGET_DOMAIN) config.widget.domain = env.WIDGET_DOMAIN;
    if (env.WIDGET_PRIMARY_COLOR) config.widget.branding.primaryColor = env.WIDGET_PRIMARY_COLOR;

    return config;
  }

  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  public getConfig(): InstanceConfig {
    return this.config;
  }

  public get<K extends keyof InstanceConfig>(key: K): InstanceConfig[K] {
    return this.config[key];
  }
}

// Singleton instance
export const configLoader = new ConfigLoader();
export const instanceConfig = configLoader.getConfig();
```

#### 2. Backend Integration

**Update `server/index.ts`:**
```typescript
import { configLoader, instanceConfig } from './config/loader';

// Load and validate configuration at startup
console.log('=== Instance Configuration ===');
console.log(`Project: ${instanceConfig.project.name}`);
console.log(`Docs Repo: ${instanceConfig.documentation.gitRepo}`);
console.log('==============================');

// Use configuration in routes
app.get('/api/config/public', (req, res) => {
  res.json({
    project: instanceConfig.project,
    branding: instanceConfig.branding,
    widget: {
      enabled: instanceConfig.widget.enabled,
      domain: instanceConfig.widget.domain,
    },
  });
});
```

**Update Git operations (`server/scraper/git-scraper.ts`):**
```typescript
import { instanceConfig } from '../config/loader';

const gitRepoUrl = `https://github.com/${instanceConfig.documentation.gitRepo}`;
const branch = instanceConfig.documentation.gitBranch;
```

**Update Analyzer prompts (`server/analyzer/gemini-analyzer.ts`):**
```typescript
import { instanceConfig } from '../config/loader';

const systemPrompt = `You are analyzing documentation for ${instanceConfig.project.name}...`;
```

#### 3. Frontend Integration

**Create frontend config hook (`client/src/hooks/useInstanceConfig.ts`):**
```typescript
import { useQuery } from '@tanstack/react-query';

interface PublicConfig {
  project: {
    name: string;
    slug: string;
    description: string;
  };
  branding: {
    logoUrl: string;
    faviconUrl: string;
    colors: {
      primary: string;
      secondary: string;
    };
    metaTags: {
      title: string;
      description: string;
    };
  };
  widget: {
    enabled: boolean;
    domain: string;
  };
}

export function useInstanceConfig() {
  return useQuery<PublicConfig>({
    queryKey: ['instance-config'],
    queryFn: async () => {
      const response = await fetch('/api/config/public');
      if (!response.ok) throw new Error('Failed to load configuration');
      return response.json();
    },
    staleTime: Infinity, // Config doesn't change during runtime
  });
}
```

**Update Header component (`client/src/components/Header.tsx`):**
```typescript
import { useInstanceConfig } from '../hooks/useInstanceConfig';

export function Header() {
  const { data: config } = useInstanceConfig();

  if (!config) return null;

  return (
    <header>
      <img src={config.branding.logoUrl} alt={`${config.project.name} logo`} />
      <h1>{config.project.name} Documentation</h1>
    </header>
  );
}
```

**Update index.html:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="%VITE_FAVICON_URL%" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>%VITE_PROJECT_NAME% Documentation</title>
    <meta name="description" content="%VITE_PROJECT_DESCRIPTION%" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Vite environment plugin (`vite.config.ts`):**
```typescript
import { defineConfig } from 'vite';
import { configLoader } from './server/config/loader';

export default defineConfig({
  define: {
    'import.meta.env.VITE_PROJECT_NAME': JSON.stringify(
      configLoader.get('project').name
    ),
    'import.meta.env.VITE_PROJECT_DESCRIPTION': JSON.stringify(
      configLoader.get('project').description
    ),
    'import.meta.env.VITE_FAVICON_URL': JSON.stringify(
      configLoader.get('branding').faviconUrl
    ),
  },
});
```

#### 4. Widget Integration

**Update widget script to accept config:**
```typescript
// Widget initialization with config
window.initDocWidget({
  primaryColor: '%WIDGET_PRIMARY_COLOR%',
  projectName: '%PROJECT_NAME%',
  domain: '%WIDGET_DOMAIN%',
});
```

### Files to Modify

#### Backend Files

1. **Create:**
   - `server/config/loader.ts` - Configuration loader
   - `server/config/types.ts` - TypeScript interfaces
   - `config/instance.json` - Default configuration file (gitignored)
   - `config/instance.example.json` - Example configuration

2. **Modify:**
   - `server/index.ts` - Load config at startup, expose public config endpoint
   - `server/analyzer/gemini-analyzer.ts` - Replace "NEAR" in prompts with `config.project.name`
   - `server/scraper/zulipchat.ts` - Use `config.community.sources` for Zulip config
   - `server/routes.ts` - Use config for Git operations
   - `.env.example` - Add new environment variables

#### Frontend Files

1. **Create:**
   - `client/src/hooks/useInstanceConfig.ts` - Config fetching hook
   - `client/src/types/config.ts` - Frontend config types

2. **Modify:**
   - `client/src/components/Header.tsx` - Use `config.project.name` and `config.branding.logoUrl`
   - `client/index.html` - Use Vite env variables for meta tags
   - `client/src/App.tsx` - Use config for titles
   - `vite.config.ts` - Inject config into build

#### Widget Files

1. **Modify:**
   - Widget HTML generation to use config values
   - Widget styles to use `config.widget.branding.primaryColor`

### Database Impact

**No database schema changes required.** Configuration is instance-specific and loaded from files/environment, not stored in database.

Each deployment instance has its own independent database (per-instance model), so no multi-tenancy considerations.

### API Changes

**New Endpoint:**

```
GET /api/config/public
Returns: Public-facing configuration (project, branding, widget)
Auth: None (public)
```

Response:
```json
{
  "project": {
    "name": "NEAR Protocol",
    "slug": "near",
    "description": "NEAR Protocol Documentation Hub"
  },
  "branding": {
    "logoUrl": "https://near.org/logo.svg",
    "faviconUrl": "/favicon.ico",
    "colors": {
      "primary": "#00C1DE",
      "secondary": "#000000"
    },
    "metaTags": {
      "title": "NEAR Protocol Documentation",
      "description": "Comprehensive documentation for NEAR Protocol"
    }
  },
  "widget": {
    "enabled": true,
    "domain": "https://experthub.lionscraft.io"
  }
}
```

### Testing Strategy

#### Unit Tests

1. **Configuration Loader Tests:**
   - Default configuration loads correctly
   - JSON file parsing and merging
   - Environment variable overrides
   - Validation errors for invalid config
   - Missing required fields handled

2. **Config Access Tests:**
   - Singleton pattern works correctly
   - Type-safe access to config values

#### Integration Tests

1. **Backend Integration:**
   - `/api/config/public` returns correct data
   - Git scraper uses correct repository URL
   - Analyzer uses correct project name in prompts

2. **Frontend Integration:**
   - `useInstanceConfig` hook fetches and caches config
   - Header displays correct logo and name
   - Meta tags rendered correctly

#### Manual Testing

1. **NEAR Configuration (Default):**
   - No config file → defaults to NEAR
   - Verify all NEAR branding appears
   - Verify near/docs repository used

2. **Conflux Configuration:**
   - Create `config/instance.json` with Conflux values
   - Verify Conflux branding throughout
   - Verify conflux-chain/conflux-docs repository used

3. **Environment Variable Overrides:**
   - Set `PROJECT_NAME=Test Protocol`
   - Verify override takes precedence

### Migration Path

#### Phase 1: Add Configuration Layer (No Breaking Changes)
1. Create configuration loader with NEAR defaults
2. Add `config/instance.example.json`
3. Expose `/api/config/public` endpoint
4. Frontend hook for config fetching

#### Phase 2: Replace Hardcoded References
1. Update backend to use config (Git URLs, prompts)
2. Update frontend components to use config hook
3. Update widget to use config

#### Phase 3: Validation & Documentation
1. Comprehensive grep for remaining "NEAR" references
2. Update deployment documentation
3. Create Conflux example configuration
4. Test both NEAR and Conflux deployments

### Error Handling

**Configuration Loading Errors:**
- Missing required fields → Fail fast with clear error message
- Invalid JSON → Log parse error, fail to start
- Invalid color format → Validation error with field name
- Missing config file → Use defaults (backward compatible)

**Runtime Errors:**
- Config unavailable in frontend → Show loading state
- Failed to fetch `/api/config/public` → Retry with exponential backoff

### Performance Considerations

- Configuration loaded once at server startup (not per-request)
- Frontend config cached indefinitely (staleTime: Infinity)
- No performance impact on existing functionality
- Config file size negligible (<10KB)

### Security Considerations

- Sensitive config (API keys, secrets) remain in environment variables (not in JSON file)
- Public config endpoint only exposes non-sensitive data
- Config file can be `.gitignore`d for customer-specific deployments
- CORS origins configurable per instance

### Deployment Process

**For New Customer (e.g., Conflux):**

1. Clone repository
2. Create `config/instance.json`:
   ```json
   {
     "project": {
       "name": "Conflux Protocol",
       "slug": "conflux",
       "description": "Conflux Documentation Hub",
       "domain": "confluxdocs.ai"
     },
     "documentation": {
       "gitRepo": "conflux-chain/conflux-docs",
       "gitBranch": "main"
     },
     "branding": {
       "logoUrl": "https://conflux.network/logo.svg",
       "colors": {
         "primary": "#FF6B00",
         "secondary": "#1A1A1A"
       }
     }
   }
   ```
3. Set environment variables (DATABASE_URL, API keys)
4. Run `npm install && npm run build`
5. Start application

**Time to deploy:** ~15-30 minutes (mostly infrastructure setup)

### Rollback Strategy

If issues occur:
1. Remove `config/instance.json` → Application falls back to NEAR defaults
2. Unset environment variable overrides
3. Restart application

No database migrations required, so rollback is simple.

## Dependencies

**New Dependencies:**
- `zod` (if not already installed) - Configuration validation

**Existing Dependencies:**
- No changes to existing dependencies

## Open Questions

1. Should configuration file be version-controlled or gitignored?
   - **Recommendation:** Provide `instance.example.json` in repo, gitignore `instance.json` for deployments

2. Should widget configuration be in same file or separate?
   - **Recommendation:** Same file for simplicity, nested under `widget` key

3. Do we need configuration hot-reload?
   - **Recommendation:** No, restart acceptable for config changes

4. Should we support multiple community sources of same type (e.g., 2 Zulip channels)?
   - **Recommendation:** Yes, support array of sources per type

## Success Criteria

- [ ] Configuration loader implemented with validation
- [ ] Default NEAR configuration backward compatible
- [ ] Environment variable overrides working
- [ ] `/api/config/public` endpoint functional
- [ ] Frontend `useInstanceConfig` hook implemented
- [ ] All hardcoded "NEAR" references replaced
- [ ] Header uses config for logo and name
- [ ] Git scraper uses config for repository URL
- [ ] Analyzer uses config for project name in prompts
- [ ] Widget uses config for branding
- [ ] Conflux configuration tested end-to-end
- [ ] Documentation updated with examples
- [ ] Zero code changes required for new deployments

## Related Documentation

- Story: `/docs/stories/multi-instance-configuration.md`
- Architecture: `/docs/architecture/multi-instance-configuration.md`
- Tasks: `/docs/tasks/tasks-multi-instance-configuration.md`
