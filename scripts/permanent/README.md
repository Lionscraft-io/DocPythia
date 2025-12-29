# Permanent Scripts

This directory contains long-term, stable scripts used for project operations.

## Contents

- Build scripts
- Deployment automation
- Database maintenance
- Backup and restore utilities
- Development utilities

All scripts should be documented with usage instructions.

## Available Scripts

### kill-port.sh

Kills all running DocsAI application processes.

**Usage:**
```bash
# Via npm script (recommended)
npm run kill-port

# Direct execution
./scripts/permanent/kill-port.sh
```

**What it does:**
- Kills all processes using port 3762
- Terminates all tsx server/index.ts processes
- Cleans up any hung development server instances
