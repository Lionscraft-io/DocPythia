# Technical Specifications

This directory contains technical specifications for features and major changes.

## Structure

Each spec should include:
- **Overview**: What is being built
- **Implementation Details**: Technical approach, architecture decisions
- **Data Impact**: Database schema changes, migrations required
- **Dependencies**: External libraries, services, or features required
- **Acceptance Criteria**: How to verify implementation is complete

## Naming Convention

`YYYY-MM-DD-feature-name.md` or `feature-name.md`

Example: `2025-10-17-ai-widget-integration.md`

## Current Specifications

### Admin Portal
- **admin-customer-view-mapping.md** - Mapping specification for refactoring admin portal into customer-facing and advanced views. Defines how to simplify the complex multi-stream processing interface into a clean customer experience while preserving all functionality for internal use.