# Story: Multi-Instance Customer Configuration System

**Developer:** Wayne
**Date:** 2025-10-29
**Status:** Active
**Priority:** High (Blocking)

## Context

NearDocsAI currently serves only NEAR Protocol with hardcoded values throughout the application. The platform needs to support multiple blockchain protocol customers (NEAR, Conflux, and future protocols), with each customer receiving their own independent deployment instance with custom branding, documentation sources, and community integrations.

Wayne is currently blocked from working on Conflux Protocol because all UI elements, Git repository URLs, prompts, and branding are hardcoded to "NEAR".

## Problem Statement

**Current State:**
- Application hardcoded for NEAR Protocol
- Git repository URL fixed to `near/docs`
- "NEAR" appears in headers, titles, meta tags, prompts
- Logo and branding cannot be changed without code modifications
- Zulip/Telegram channels hardcoded to NEAR community
- Widget branding fixed to NEAR

**Business Impact:**
- Cannot onboard new protocol customers (Conflux, others)
- Each new customer requires code changes and redeployment
- Wayne blocked from immediate Conflux work
- Limits platform scalability and market expansion

**User Pain:**
- Deployment teams must modify code for new customers
- No single source of truth for customer configuration
- Risk of inconsistent branding across components
- Time-consuming manual changes across multiple files

## User Stories

### Primary User: Platform Administrator (Wayne)

**As a** platform administrator deploying for a new protocol customer,
**I want to** configure the entire application through environment variables and a configuration file,
**So that** I can deploy branded instances without modifying code.

**Acceptance Criteria:**
- Set customer name, colors, logo via configuration
- Specify Git documentation repository URL
- Configure chat types and community sources
- Customize widget branding
- All "NEAR" hardcoded references replaced with config values
- Configuration validated at startup with clear error messages
- Default to NEAR configuration if none specified (backward compatible)

### Secondary User: End User (Protocol Developer)

**As a** developer visiting a protocol's documentation site,
**I want to** see the correct protocol branding and documentation,
**So that** I know I'm in the right place and receive accurate information.

**Acceptance Criteria:**
- Correct logo and project name in header
- Accurate favicon and meta tags for SEO
- Documentation matches the protocol's Git repository
- Widget reflects protocol-specific styling
- Community chat links point to correct channels

## Solution Requirements

### Functional Requirements

1. **Configuration Management**
   - Support environment variables for simple configs
   - Support JSON configuration file for complex structures
   - Load configuration at application startup
   - Validate required configuration fields
   - Provide clear error messages for missing/invalid config

2. **Branding Configuration**
   - Project name
   - Logo URL and favicon
   - Primary and secondary brand colors
   - Project description and tagline

3. **Documentation Source Configuration**
   - Git repository URL
   - Git branch (default: main)
   - Documentation path within repo

4. **Community Integration Configuration**
   - Multiple chat types (Zulip, Telegram, Discord)
   - Channel/stream names per chat type
   - Community source URLs

5. **Widget Configuration**
   - Widget domain
   - Widget-specific branding
   - Positioning and styling options

6. **Deployment Model**
   - One instance per customer
   - Independent databases per instance
   - No multi-tenancy within deployment
   - Simple config change for new deployment

### Non-Functional Requirements

1. **Performance**
   - Configuration loaded once at startup
   - No runtime performance impact
   - No hot-reload required (restart acceptable)

2. **Maintainability**
   - Single source of truth for configuration
   - Configuration schema documented
   - TypeScript interfaces for type safety

3. **Backward Compatibility**
   - Default to NEAR configuration if not specified
   - Existing deployments continue working

4. **Developer Experience**
   - Clear configuration examples
   - Validation errors with actionable messages
   - Documentation for adding new config fields

## Success Metrics

1. **Immediate Success (Wayne's Use Case)**
   - Wayne can deploy Conflux instance by changing configuration only
   - No code modifications required
   - Correct Conflux branding throughout application

2. **Platform Success**
   - Time to deploy new customer instance < 30 minutes
   - Zero code changes required for standard configurations
   - All hardcoded "NEAR" references eliminated

3. **Quality Metrics**
   - Configuration validation catches 100% of missing required fields
   - No regression in existing NEAR deployment
   - Type-safe configuration access throughout codebase

## Out of Scope

- Multi-tenancy (one database serving multiple customers)
- Runtime configuration changes (admin UI for editing config)
- Customer self-service deployment portal
- Configuration versioning or migration tools
- A/B testing different configurations
- User-level preferences (theme switching)

## Dependencies

- Environment variable access (dotenv or native)
- JSON file reading capability
- TypeScript type generation for config schema
- Update to all components referencing hardcoded values

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Missing hardcoded references | High | Comprehensive grep for "NEAR", "near/docs", etc. |
| Invalid configuration breaks app | High | Startup validation with fail-fast behavior |
| Configuration drift between environments | Medium | Single config file, version controlled |
| Breaking existing deployments | Medium | Backward compatible defaults |

## Related Documentation

- Spec: `/docs/specs/multi-instance-configuration.md`
- Architecture: `/docs/architecture/multi-instance-configuration.md`
- Tasks: `/docs/tasks/tasks-multi-instance-configuration.md`

## Notes

- Focus on environment variables + JSON file approach (not database)
- Configuration read at startup only (no hot-reload)
- Keep deployment process simple
- Prioritize Wayne's immediate Conflux needs while building scalable solution
