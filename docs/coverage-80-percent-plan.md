# Coverage 80% Plan

**Owner:** Wayne
**Created:** 2024-12-23
**Updated:** 2024-12-23
**Target:** 80% coverage for frontend and backend

## Current State

| Area | Files | Current Coverage | Target |
|------|-------|------------------|--------|
| Backend (server/) | 53 | ~14% | 80% |
| Frontend Components | 12 | 87% | 80% ✅ |
| Frontend Pages | 7 | 18% | 80% |
| Frontend Hooks | 2 | 48% | 80% |

### Test Status
- 30 test files total
- **26 passing** (frontend + backend)
- **4 skipped** (integration tests requiring DB connectivity)
- 286/339 tests passing (84%), 53 skipped

---

## Backend File Coverage (Target: 80% each)

### Root (`server/`) - 12 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `db.ts` | 66.66% | 80% | Medium | ⚠️ Partial |
| `env.ts` | 0% | 80% | Low | ❌ |
| `git-fetcher.ts` | 0% | 80% | High | ❌ |
| `index.ts` | 0% | 80% | Low | ❌ Entry point |
| `migrate.ts` | 0% | 80% | Low | ❌ Script |
| `routes.ts` | 0% | 80% | High | ❌ |
| `scheduler.ts` | 0% | 80% | Medium | ❌ |
| `seed.ts` | 0% | 80% | Low | ❌ Script |
| `storage.ts` | 0% | 80% | High | ❌ |
| `vector-store.ts` | 1.58% | 80% | High | ❌ |
| `vite.ts` | 0% | 80% | Low | ❌ Dev tooling |
| `validate-workflow.ts` | 0% | 80% | Low | ❌ Script |

**Skip (test scripts):** `test-analyzer.ts`, `test-scheduler.ts`, `test-scraper-store.ts`, `test-scraper.ts`

---

### Analyzer (`server/analyzer/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `gemini-analyzer.ts` | 0% | 80% | High | ❌ |

---

### Auth (`server/auth/`) - 2 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `multi-instance-auth.ts` | 0% | 80% | High | ❌ |
| `password.ts` | 0% | 80% | Medium | ❌ |

---

### Config (`server/config/`) - 5 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `defaults.ts` | 100% | 80% | - | ✅ Done |
| `schemas.ts` | 100% | 80% | - | ✅ Done |
| `loader.ts` | 75.34% | 80% | Low | ⚠️ Close |
| `instance-loader.ts` | 1.4% | 80% | Medium | ❌ |
| `types.ts` | 0% | 80% | Low | ❌ Types only |

---

### Database (`server/db/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `instance-db.ts` | 5.55% | 80% | High | ❌ |

---

### Embeddings (`server/embeddings/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `gemini-embedder.ts` | 11.11% | 80% | Medium | ❌ |

---

### LLM (`server/llm/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `llm-cache.ts` | 5.72% | 80% | Medium | ❌ |

---

### Middleware (`server/middleware/`) - 2 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `instance.ts` | 0% | 80% | High | ❌ |
| `multi-instance-admin-auth.ts` | 0% | 80% | High | ❌ |

---

### Routes (`server/routes/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `auth-routes.ts` | 0% | 80% | High | ❌ |

---

### Scraper (`server/scraper/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `zulipchat.ts` | 0% | 80% | Medium | ❌ |

---

### Scripts (`server/scripts/`) - 6 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `analyze-messages.ts` | 0% | 80% | Low | ❌ Script |
| `diagnose-sni-filtering.ts` | 0% | 80% | Low | ❌ Script |
| `diagnose-telegram-connectivity.ts` | 0% | 80% | Low | ❌ Script |
| `full-scrape.ts` | 0% | 80% | Low | ❌ Script |
| `inspect-doc-index.ts` | 0% | 80% | Low | ❌ Script |
| `manual-telegram-import.ts` | 0% | 80% | Low | ❌ Script |

---

### Stream (`server/stream/`) - 5 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `types.ts` | 100% | 80% | - | ✅ Done |
| `stream-manager.ts` | 0% | 80% | **Critical** | ❌ |
| `message-vector-search.ts` | 0% | 80% | High | ❌ |
| `doc-index-generator.ts` | 0% | 80% | Medium | ❌ |
| `test-doc-index.ts` | 0% | 80% | Low | ❌ Test script |

---

### Stream Adapters (`server/stream/adapters/`) - 4 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `telegram-bot-adapter.ts` | 40.24% | 80% | High | ⚠️ Partial |
| `zulip-bot-adapter.ts` | 24.35% | 80% | High | ⚠️ Partial |
| `base-adapter.ts` | 9.3% | 80% | High | ❌ |
| `csv-file-adapter.ts` | 0% | 80% | Medium | ❌ |

---

### Stream LLM (`server/stream/llm/`) - 2 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `prompt-templates.ts` | 53.84% | 80% | Medium | ⚠️ Partial |
| `llm-service.ts` | 10.84% | 80% | High | ❌ |

---

### Stream Processors (`server/stream/processors/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `batch-message-processor.ts` | 89.64% | 80% | - | ✅ Done |

---

### Stream Routes (`server/stream/routes/`) - 1 file

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `admin-routes.ts` | 8.39% | 80% | High | ❌ |

---

### Stream Services (`server/stream/services/`) - 4 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `changeset-batch-service.ts` | 20% | 80% | High | ⚠️ Partial |
| `file-modification-service.ts` | 4.16% | 80% | High | ❌ |
| `file-consolidation-service.ts` | 0% | 80% | Medium | ❌ |
| `github-pr-service.ts` | 2% | 80% | High | ❌ |

---

## Frontend File Coverage (Target: 80% each)

### Components (`client/src/components/`) - 12 files

| File | Current | Target | Status |
|------|---------|--------|--------|
| `DocContent.tsx` | 100% | 80% | ✅ Done |
| `DropdownWidget.tsx` | 75.86% | 80% | ⚠️ Close |
| `EditProposalModal.tsx` | 100% | 80% | ✅ Done |
| `Header.tsx` | 100% | 80% | ✅ Done |
| `NodeTypeCard.tsx` | 100% | 80% | ✅ Done |
| `PRPreviewModal.tsx` | 90.9% | 80% | ✅ Done |
| `ProposalActionButtons.tsx` | 100% | 80% | ✅ Done |
| `StatsCard.tsx` | 100% | 80% | ✅ Done |
| `TableOfContents.tsx` | 100% | 80% | ✅ Done |
| `ThemeToggle.tsx` | 100% | 80% | ✅ Done |
| `UpdateCard.tsx` | 45.45% | 80% | ⚠️ Partial |
| `VersionHistoryCard.tsx` | 85% | 80% | ✅ Done |

---

### Pages (`client/src/pages/`) - 7 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `Admin.tsx` | 27.16% | 80% | High | ⚠️ Partial |
| `AdminAdvanced.tsx` | 0% | 80% | High | ❌ |
| `AdminLegacy.tsx` | 0% | 80% | Low | ❌ Legacy |
| `AdminLogin.tsx` | 75% | 80% | Low | ⚠️ Close |
| `Documentation.tsx` | 87.17% | 80% | - | ✅ Done |
| `Logout.tsx` | 100% | 80% | - | ✅ Done |
| `not-found.tsx` | 100% | 80% | - | ✅ Done |

---

### Hooks (`client/src/hooks/`) - 3 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `use-mobile.tsx` | 0% | 80% | Medium | ❌ |
| `use-toast.ts` | 52.83% | 80% | Medium | ⚠️ Partial |
| `useConfig.ts` | 80% | 80% | - | ✅ Done |

---

### Lib (`client/src/lib/`) - 2 files

| File | Current | Target | Priority | Status |
|------|---------|--------|----------|--------|
| `queryClient.ts` | 0% | 80% | High | ❌ |
| `utils.ts` | 100% | 80% | - | ✅ Done |

---

## Priority Order for Unit Tests

### Critical (Core functionality)
1. [ ] `stream-manager.ts` - 0% → 80%
2. [ ] `admin-routes.ts` (stream) - 8% → 80%
3. [ ] `auth-routes.ts` - 0% → 80%

### High (Important services)
4. [ ] `llm-service.ts` - 11% → 80%
5. [ ] `changeset-batch-service.ts` - 20% → 80%
6. [ ] `file-modification-service.ts` - 4% → 80%
7. [ ] `github-pr-service.ts` - 2% → 80%
8. [ ] `telegram-bot-adapter.ts` - 40% → 80%
9. [ ] `zulip-bot-adapter.ts` - 24% → 80%
10. [ ] `base-adapter.ts` - 9% → 80%
11. [ ] `instance-db.ts` - 6% → 80%
12. [ ] `multi-instance-auth.ts` - 0% → 80%
13. [ ] `multi-instance-admin-auth.ts` - 0% → 80%
14. [ ] `middleware/instance.ts` - 0% → 80%
15. [ ] `message-vector-search.ts` - 0% → 80%
16. [ ] `vector-store.ts` - 2% → 80%
17. [ ] `gemini-analyzer.ts` - 0% → 80%

### Medium (Supporting services)
18. [ ] `prompt-templates.ts` - 54% → 80%
19. [ ] `llm-cache.ts` - 6% → 80%
20. [ ] `gemini-embedder.ts` - 11% → 80%
21. [ ] `zulipchat.ts` - 0% → 80%
22. [ ] `csv-file-adapter.ts` - 0% → 80%
23. [ ] `file-consolidation-service.ts` - 0% → 80%
24. [ ] `instance-loader.ts` - 1% → 80%
25. [ ] `password.ts` - 0% → 80%
26. [ ] `scheduler.ts` - 0% → 80%
27. [ ] `doc-index-generator.ts` - 0% → 80%
28. [ ] `storage.ts` - 0% → 80%
29. [ ] `git-fetcher.ts` - 0% → 80%
30. [ ] `db.ts` - 67% → 80%
31. [ ] `loader.ts` - 75% → 80%

### Low (Scripts, entry points, dev tooling)
32. [ ] `routes.ts` (main) - 0% → 80%
33. [ ] `index.ts` - 0% → 80%
34. [ ] `env.ts` - 0% → 80%
35. [ ] `vite.ts` - 0% → 80%
36. [ ] `migrate.ts` - 0% → 80%
37. [ ] `seed.ts` - 0% → 80%
38. [ ] `validate-workflow.ts` - 0% → 80%
39. [ ] Scripts in `server/scripts/` (6 files) - 0% → 80%

### Frontend Priority
40. [ ] `Admin.tsx` - 27% → 80%
41. [ ] `AdminAdvanced.tsx` - 0% → 80%
42. [ ] `AdminLogin.tsx` - 75% → 80%
43. [ ] `UpdateCard.tsx` - 45% → 80%
44. [ ] `DropdownWidget.tsx` - 76% → 80%
45. [ ] `use-toast.ts` - 53% → 80%
46. [ ] `use-mobile.tsx` - 0% → 80%
47. [ ] `queryClient.ts` - 0% → 80%

---

## Summary by Coverage Level

| Coverage Level | Backend Files | Frontend Files | Total |
|----------------|---------------|----------------|-------|
| ✅ 80%+ (Done) | 5 | 12 | 17 |
| ⚠️ 20-79% (Partial) | 6 | 6 | 12 |
| ❌ 1-19% (Minimal) | 8 | 0 | 8 |
| ❌ 0% (None) | 34 | 4 | 38 |
| **Total** | **53** | **22** | **75** |

---

## Session Log

### 2024-12-23
- Rewritten `batch-message-processor.test.ts` (17 tests, 89.64% coverage)
- Created `llm-service.test.ts` (28 tests, 10.84% coverage)
- Created `changeset-batch-service.test.ts` (17 tests, 20% coverage)
- Deleted obsolete `conversation-grouping.test.ts`
- Marked `per-stream-watermarks.test.ts` as redundant
- Total: 286 tests passing, 53 skipped

---

## Notes

- UI components from shadcn/ui (`client/src/components/ui/`) are excluded
- Test files in `/tests/` directory
- Run `npm run test:coverage` to check progress
- Scripts in `server/scripts/` are low priority (CLI utilities)
- Test scripts (`test-*.ts`) can be skipped
