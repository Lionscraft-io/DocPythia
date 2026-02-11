# Pythia Architecture & Deployment Guide

## 1. System Overview

Single-container Node.js application running on AWS App Runner. Handles message ingestion from community channels, AI-powered analysis, and documentation update proposals.

**Components in single container:**
- Express API server (port 8080)
- Stream adapters (Telegram polling, Zulip pull)
- Batch processing pipeline
- RAG-enabled documentation assistant
- Admin dashboard

**External dependencies:**
- PostgreSQL 15 + pgvector (Neon)
- Google Gemini API (LLM + embeddings)
- S3 (instance configuration)
- GitHub (documentation source)

---

## 2. Component Responsibilities

### Logical Roles (all in one container today)

| Role | Responsibility | Scaling Impact |
|------|----------------|----------------|
| **Ingestion Loop** | Telegram long-polling, Zulip API pull | Network-bound, low CPU |
| **Processing Pipeline** | LLM classification, proposal generation | CPU/API-bound, rate-limited |
| **Storage Layer** | Prisma ORM, pgvector embeddings | I/O-bound |
| **RAG Engine** | Git sync, embedding generation, similarity search | Memory-intensive |
| **Dispatch Layer** | Admin API, proposal review, PR generation | Low load |

**Future split consideration:** If Gemini rate-limits become problematic, processing pipeline can be extracted to separate worker with SQS queue.

---

## 3. Data Flow

```
[Telegram/Zulip] → [Adapter] → [unifiedMessage table] → [Batch Processor]
                                      ↓
                              [Import Watermark]

[Batch Processor] → [Gemini Classification] → [messageClassification table]
        ↓
[RAG Search] → [docProposal table] → [Post-Processor] → [Admin Review]
        ↓
[PR Generation] → [GitHub]
```

### Message Status Lifecycle
```
PENDING → (batch processing) → COMPLETED
                            → FAILED (with failureCount, lastError)
```

### Watermark System (Dual)
- **Import watermark:** Tracks last message fetched from adapter
- **Processing watermark:** Tracks last batch processed by pipeline

---

## 4. RAG Lifecycle

### Documentation Sync
1. **Clone:** First run clones repo to `/var/cache/{instance}-docs`
2. **Pull:** Subsequent runs attempt `git pull`; falls back to fresh clone on failure
3. **Change detection:** `git diff --name-only` between stored commit hash and HEAD
4. **Tracking:** `gitSyncState` table stores: `lastCommitHash`, `branch`, `lastSyncAt`, `syncStatus`

### Embedding Generation
- **Model:** `text-embedding-004` (768 dimensions)
- **Incremental:** Only changed files re-embedded on sync
- **Storage:** `document_pages` table with pgvector column
- **Cache:** LLM responses cached with `{commitHash}_{configHash}` key

### Authoritative Source
- **Git repository is authoritative** for documentation content
- **Postgres is authoritative** for embeddings and processing state
- Local cache is ephemeral (rebuilt on container restart)

### Embedding Regeneration
| Trigger | Scope |
|---------|-------|
| New git commit | Changed files only (incremental) |
| Config hash change | Full regeneration |
| Manual via admin API | Full regeneration |

---

## 5. Failure Handling & Retry Strategy

### Gemini API
- **Retry:** 3 attempts with exponential backoff (2s → 4s → 8s)
- **Transient errors:** Rate limits, timeouts → retry with backoff
- **Non-transient errors:** Fail immediately
- **Rate limiting:** 100ms delay between batch embedding requests

### Telegram Adapter
- **409 CONFLICT:** Indicates duplicate bot instance polling; logged as warning
- **Network failure:** `bot.launch()` not awaited; adapter remains registered
- **Reconnect:** Telegraf handles automatic reconnection
- **Fallback:** Bot usable for webhooks even if polling fails

### Zulip Adapter
- **Connection test:** Validates credentials before initialization
- **Pull failure:** Logged, watermark not advanced, retried next interval

### Database
- **Message save failure:** Logged, continues processing remaining messages
- **Watermark drift:** Compared with actual database state on sync

### Processing Pipeline
- **Batch failure:** Messages remain PENDING, retried next batch window
- **Individual failure:** `failureCount` incremented, `lastError` recorded
- **No dead-letter queue:** Failed messages stay in database for retry

### Git Operations
- **Pull failure:** Falls back to fresh clone
- **Clone failure:** Pipeline continues without RAG context

---

## 6. Scaling Assumptions

### Current Limits
- **Max concurrent streams:** 3 (configurable)
- **Max batch size:** 30 messages (prevents LLM token explosion)
- **Polling intervals:** Telegram 3s, Zulip 30s
- **Single App Runner instance:** No horizontal scaling configured

### Bottlenecks
| Component | Constraint | Mitigation |
|-----------|------------|------------|
| Gemini API | Rate limits | Exponential backoff, batching |
| Telegram | Single polling connection per token | One instance only |
| Database | Connection pool (Neon limits) | Prisma connection management |
| Memory | Git clone + embeddings | Instance-specific cache dirs |

### When to Scale
- Message backlog growing → Increase batch window or add worker
- Gemini rate limits hit frequently → Add request queuing
- Multiple instances needed → Extract polling to dedicated service

---

## 7. App Runner Limitations (Acknowledged)

| Limitation | Impact | Workaround |
|------------|--------|------------|
| No native cron | Background scheduling needed | Internal node-cron |
| Cold start | Polling restarts on wake | Watermark ensures no data loss |
| No inbound sockets | Webhook preferred over polling | Telegram polling works, but adds latency |
| Limited networking | No VPC by default | Use public database endpoints |
| 30 min request timeout | Long-running jobs may fail | Batch jobs stay under limit |

---

## 8. Deployment Prerequisites

### AWS Services Required
- **App Runner:** Application hosting
- **ECR:** Container registry (or use GHCR)
- **S3:** Configuration storage
- **CloudWatch:** Logs (automatic with App Runner)

### IAM Permissions (App Runner service role)
```
sts:GetCallerIdentity
ecr:GetAuthorizationToken
ecr:BatchGetImage
ecr:GetDownloadUrlForLayer
s3:GetObject (config bucket)
logs:CreateLogStream
logs:PutLogEvents
```

### Required Secrets
| Secret | Purpose | Rotation |
|--------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | On credential change |
| `GEMINI_API_KEY` | LLM API access | Manually |
| `TELEGRAM_BOT_TOKEN` | Per-instance bot | On compromise |
| `ZULIP_API_KEY` | Per-instance bot | On compromise |
| `ADMIN_TOKEN` | Admin API auth | Regularly |
| `GITHUB_TOKEN` | PR creation (Phase 2) | 90 days |

### S3 Configuration Structure
```
s3://pythia-config/
  config/
    myinstance/
      instance.json    # Instance configuration
    projecta/
      instance.json
```

---

## 9. Environment Variables

### Application Core
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NODE_ENV` | No | production | Runtime mode |
| `PORT` | No | 8080 | Server port |
| `DATABASE_URL` | **YES** | - | PostgreSQL connection |
| `ADMIN_TOKEN` | **YES** | - | Admin authentication |

### LLM Configuration
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GEMINI_API_KEY` | **YES** | - | Google AI API key |
| `LLM_CLASSIFICATION_MODEL` | No | gemini-2.5-flash | Classification model |
| `LLM_PROPOSAL_MODEL` | No | gemini-2.5-flash | Proposal generation |
| `LLM_VERBOSE_LOGGING` | No | false | Debug LLM calls |

### Stream Configuration
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `STREAM_MANAGER_ENABLED` | No | true | Enable stream processing |
| `TELEGRAM_BOT_TOKEN` | Per-instance | - | Bot authentication |
| `TELEGRAM_ALLOWED_CHATS` | Per-instance | - | Whitelist chat IDs |
| `ZULIP_BOT_EMAIL` | Per-instance | - | Bot email |
| `ZULIP_API_KEY` | Per-instance | - | API key |
| `ZULIP_SITE` | Per-instance | - | Zulip server URL |

### Processing Pipeline
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `BATCH_WINDOW_HOURS` | No | 24 | Message batch window |
| `MAX_BATCH_SIZE` | No | 30 | Max messages per batch |
| `RAG_TOP_K` | No | 5 | Docs retrieved per query |

### Instance Overrides (Multi-tenant)
```
{INSTANCE}_{ADAPTER}_{SETTING}
Example: MYINSTANCE_TELEGRAM_BOT_TOKEN, PROJECTA_ZULIP_API_KEY
```

---

## 10. Secrets Management

### Current State (NOT PRODUCTION-READY)
- Environment variables injected at App Runner deploy
- No secrets rotation mechanism
- No AWS Secrets Manager integration

### Recommended Production Setup
1. Store secrets in AWS Secrets Manager
2. Reference secrets by ARN in App Runner configuration
3. Enable automatic rotation where supported
4. Use IAM roles for AWS service authentication

### Token Rotation Process (Manual)
1. Generate new token in respective service (Telegram BotFather, Zulip settings)
2. Update S3 instance configuration
3. Update App Runner environment variable
4. Trigger App Runner deployment: `aws apprunner start-deployment --service-arn {arn}`

---

## 11. Rollout & Rollback

### Docker Image Tags
| Tag | Purpose | Use For |
|-----|---------|---------|
| `latest` | Most recent main build | Development |
| `{version}` | Semantic version (e.g., 1.0.0) | Production pinning |
| `{sha}` | Git commit SHA | Precise rollback |

### Deployment Trigger
```bash
# Automatic (CI pushes to GHCR, App Runner auto-deploys if configured)
git push origin main

# Manual trigger
aws apprunner start-deployment --service-arn arn:aws:apprunner:...
```

### Rollback Procedure
1. Identify last working image tag (check GHCR or ECR)
2. Update App Runner image configuration to specific tag
3. Trigger deployment
4. Verify health check passes
5. Monitor logs for errors

### Version Pinning
- Production should pin to semantic version tag, not `latest`
- App Runner config: `ghcr.io/lionscraft/docsai:1.0.0`

---

## 12. Operational Procedures

### Health Verification
```bash
# Check health endpoint
curl https://{app-runner-url}/api/health

# Check diagnostics
curl https://{app-runner-url}/diagnostics
```

### Trigger Manual Resync
```bash
# Via admin API (requires ADMIN_TOKEN)
curl -X POST https://{url}/api/admin/stream/process \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```

### Reset Watermarks (Reprocess All)
```bash
curl -X POST https://{url}/api/admin/stream/clear-processed \
  -H "Authorization: Bearer {ADMIN_TOKEN}"
```
This will:
- Reset all message status to PENDING
- Delete existing classifications and proposals
- Reset processing watermark to earliest message
- Clear LLM cache

### Disable a Stream
1. Edit S3 config: Set `enabled: false` for stream
2. Restart App Runner to pick up config

### View Logs
```bash
aws logs tail /aws/apprunner/{service-name} --follow
```

### Key Log Patterns
| Pattern | Meaning |
|---------|---------|
| `Processing update` | Message received from adapter |
| `Skipping already processed` | Watermark filtering working |
| `409 CONFLICT` | Duplicate bot instance (kill other process) |
| `Rate limit` | Gemini throttling (backoff in effect) |
| `Connection refused` | Database unreachable |

---

## 13. Observability

### Current State
- **Logs:** CloudWatch (via App Runner)
- **Health:** `/api/health`, `/diagnostics` endpoints
- **Metrics:** None exported

### Health Check Definition
| State | Condition |
|-------|-----------|
| Healthy | `/api/health` returns 200 |
| Unhealthy | Health check fails 3 consecutive times |
| Stuck | No new messages processed for >1 hour despite pending messages |

### Recommended Additions
- CloudWatch custom metrics: `MessagesProcessed`, `BatchDuration`, `ErrorCount`
- CloudWatch alarms: Error rate >5%, processing lag >2 hours
- X-Ray tracing for LLM call latency

---

## 14. Security Considerations

### Current Controls
- Non-root container user (`nextjs:1001`)
- HTTPS enforced for all external APIs
- Admin API requires bearer token
- Telegram chat whitelist (allowedChats)

### Assumptions (Document These)
- Database accessible only from App Runner
- S3 bucket not publicly accessible
- Gemini API key has no billing alerts (add them)
- GitHub token scoped to required repos only

### Missing Controls (Add for Production)
- Rate limiting on admin API
- Request validation/sanitization
- Audit logging for admin operations
- Secrets rotation automation

---

## 15. Environment Strategy

### Current
- Single environment (production)
- Local development via docker-compose

### Recommended
| Environment | Purpose | Database | Config Bucket |
|-------------|---------|----------|---------------|
| Development | Local testing | docker-compose postgres | Local files |
| Staging | Pre-production | Separate Neon branch | `pythia-config-staging` |
| Production | Live | Neon production | `pythia-config` |

---

## Quick Reference

### Restart Application
```bash
aws apprunner start-deployment --service-arn {arn}
```

### Check Processing Backlog
```sql
SELECT COUNT(*) FROM "unifiedMessage" WHERE "processingStatus" = 'PENDING';
```

### Force Reprocess
```bash
curl -X POST {url}/api/admin/stream/clear-processed -H "Authorization: Bearer {token}"
```

### View Stream Health
```bash
curl {url}/api/admin/stream/health -H "Authorization: Bearer {token}"
```
