# Documentation Index System - Complete Explanation

## What is `doc-index.config.json`?

The `doc-index.config.json` is a **manually created configuration file** that controls how documentation is filtered and organized for LLM prompts. It's **not generated** - you create and maintain it yourself.

## Purpose

The doc-index system solves a critical problem: **Documentation repositories are too large to send to LLMs.**

Without filtering, you'd send 100s of pages (100K+ tokens) in every prompt. The doc-index config lets you:
1. Filter out irrelevant docs (build files, READMEs, navigation menus)
2. Limit the number of pages included
3. Define a structured hierarchy for better organization
4. Reduce token costs by 90%+

---

## The Complete Flow

### 1. **Manual Configuration** (You create this)

You manually create `config/{instance}/doc-index.config.json` with:

```json
{
  "includePatterns": ["docs/**/*.md"],
  "excludePatterns": ["**/node_modules/**", "**/README.md"],
  "excludeTitles": ["Skip to main content", "Navigation"],
  "maxPages": 50,
  "documentationHierarchy": {
    "overview": [
      "NEAR Basics > What is NEAR?",
      "NEAR Basics > Consensus"
    ],
    "core_concepts": [
      "Wallets",
      "Smart Contracts"
    ]
  }
}
```

**When to update this:**
- When your docs structure changes
- When you want to include/exclude certain sections
- When you want to reorganize the hierarchy presented to the LLM

---

### 2. **Documents in Database** (From Git sync)

Separately, your documentation pages are stored in the `document_pages` table:

```sql
-- These come from syncing your Git docs repo
document_pages (
  id,
  file_path,     -- "docs/validators/setup.md"
  title,         -- "Setting Up a Validator"
  content,       -- Full markdown content
  embedding,     -- Vector embedding for RAG
  updated_at
)
```

**How they get there:**
- Git sync process pulls docs from your configured Git repo
- RAG system processes markdown files
- Creates embeddings and stores in database

---

### 3. **Index Generation** (Runtime, on-demand)

When someone requests the documentation index:

```typescript
// API endpoint: /api/docs-index
const index = await docIndexGenerator.generateIndex();
```

**What happens:**

#### Step 1: Load Configuration
```typescript
constructor(instanceId: string) {
  // Loads config/{instanceId}/doc-index.config.json
  this.config = this.loadConfig();
}
```

#### Step 2: Fetch All Docs from Database
```typescript
const documents = await prisma.documentPage.findMany({
  select: { filePath, title, content, updatedAt }
});
// Example result: 250 documents
```

#### Step 3: Apply Filters
```typescript
const filtered = documents.filter(doc => {
  // ❌ Exclude if matches excludePatterns
  if (matchesPattern(doc.filePath, ["**/node_modules/**"])) return false;

  // ❌ Exclude if title matches excludeTitles
  if (doc.title.includes("Skip to main content")) return false;

  // ✅ Include if matches includePatterns
  if (matchesPattern(doc.filePath, ["docs/**/*.md"])) return true;

  return false;
});
// Example result: 250 → 80 documents
```

#### Step 4: Apply Limits
```typescript
const limited = filtered.slice(0, config.maxPages); // First 50
// Example result: 80 → 50 documents
```

#### Step 5: Extract Metadata
```typescript
const pages = limited.map(doc => ({
  title: doc.title,
  path: doc.filePath,
  sections: extractSections(doc.content).slice(0, 5), // Top 5 headings
  summary: generateSummary(doc.content).substring(0, 150),
  last_updated: doc.updatedAt
}));
```

#### Step 6: Categorize by Path
```typescript
const categories = {
  "validators": ["docs/validators/setup.md", "docs/validators/staking.md"],
  "developers": ["docs/dev/contracts.md", "docs/dev/testing.md"]
};
```

#### Step 7: Cache Result
```typescript
// Cache in database tied to Git commit hash
await prisma.docIndexCache.upsert({
  where: { commitHash_configHash },
  create: { indexData, compactIndex }
});
```

---

### 4. **Format for LLM Prompt** (Compact format)

The generated index is formatted for LLM consumption:

```typescript
const compactText = docIndexGenerator.formatCompact(index);
```

**Output (sent to LLM):**

```
=== DOCUMENTATION INDEX (Compact) ===
50 pages available

Overview (5 pages):
- What is NEAR? (docs/basics/what-is-near.md)
  Sections: Introduction, Sharding, Consensus
- Consensus Mechanism (docs/basics/consensus.md)
  Sections: Proof of Stake, Validators, Block Production

Core Concepts (8 pages):
- Wallets (docs/concepts/wallets.md)
  Sections: Account Model, Access Keys, Security
- Smart Contracts (docs/concepts/contracts.md)
  Sections: Writing Contracts, Deployment, Testing

Run a Node (12 pages):
- Validator Node Setup (docs/nodes/validator.md)
  Sections: Hardware Requirements, Installation, Configuration
...
```

---

### 5. **Used in LLM Prompts**

The compact index is included in LLM prompts:

```typescript
// In batch-message-processor.ts or changeset-batch-service.ts
const projectContext = await loadProjectContext(docIndexGenerator);

const prompt = `
You are analyzing conversations about ${projectContext.project_name}.

${projectContext.documentation_index}

Now analyze these conversations...
`;
```

**Why this helps:**
- LLM knows what documentation exists
- Can suggest which docs need updates
- Can reference specific sections
- Keeps context focused and relevant

---

## Cache Strategy

### Database Cache (Long-term)
```typescript
// Cached by: Git commit hash + config hash
// Invalidated when:
// 1. Git docs are updated (new commit)
// 2. doc-index.config.json changes (new config hash)
```

**Example:**
```
Commit: abc123, Config: def456 → Cached index A
Commit: abc123, Config: xyz789 → Cached index B (new config)
Commit: ghi000, Config: xyz789 → Cached index C (new docs)
```

### Memory Cache (Short-term)
Not currently implemented, but could add:
```typescript
private memoryCache: { index: DocumentationIndex, expiresAt: Date } | null = null;
```

---

## Key Files

### Configuration (Manual)
- `config/near/doc-index.config.json` - NEAR Protocol structure
- `config/conflux/doc-index.config.json` - Conflux Network structure

### Code
- `server/stream/doc-index-generator.ts` - Main generator class
- `server/routes.ts` - API endpoint `/api/docs-index`
- `server/stream/types.ts` - TypeScript interfaces

### Database
- `document_pages` table - Source documents from Git
- `doc_index_cache` table - Generated indices (cached)

---

## API Endpoints

### Get Documentation Index
```bash
GET /api/docs-index?format=json
GET /api/docs-index?format=compact    # LLM-friendly format
GET /api/docs-index?format=formatted  # Human-readable format
```

**Response:**
```json
{
  "pages": [
    {
      "title": "What is NEAR?",
      "path": "docs/basics/what-is-near.md",
      "sections": ["Introduction", "Sharding", "Consensus"],
      "summary": "NEAR is a decentralized platform...",
      "last_updated": "2025-01-15T10:30:00Z"
    }
  ],
  "categories": {
    "basics": ["docs/basics/what-is-near.md"],
    "nodes": ["docs/nodes/validator.md"]
  },
  "generated_at": "2025-01-15T12:00:00Z"
}
```

---

## Common Tasks

### Add New Documentation Section

1. **Update Git Repo** (add new docs)
2. **Sync Git** (docs get imported to database)
3. **Update config** (optional, if you want specific filtering)
   ```json
   {
     "includePatterns": [
       "docs/**/*.md",
       "new-section/**/*.md"  // ← Add this
     ]
   }
   ```
4. **Clear cache** (restart server or wait for next Git sync)

### Reduce Token Usage

```json
{
  "maxPages": 30,  // ← Lower from 50
  "maxSectionsPerPage": 3,  // ← Lower from 5
  "excludeTitles": [
    "Navigation",
    "Skip to main",
    "Footer"  // ← Add more
  ],
  "compactFormat": {
    "includeSummaries": false,  // ← Disable summaries
    "maxSectionsInCompact": 2   // ← Show fewer sections
  }
}
```

### Test Your Configuration

```bash
npx tsx server/stream/test-doc-index.ts
```

This will:
1. Generate the index using your config
2. Show filtered document count
3. Display compact format
4. Show cache status

---

## Multi-Instance Support

Each instance has its own:
- Documentation repository (different Git URL)
- Documentation structure (different hierarchy)
- Filtering rules (different include/exclude patterns)

**Example:**

```typescript
// NEAR instance
const nearGenerator = new DocumentationIndexGenerator('near');
// Loads config/near/doc-index.config.json

// Conflux instance
const confluxGenerator = new DocumentationIndexGenerator('conflux');
// Loads config/conflux/doc-index.config.json
```

---

## Summary

**The doc-index.config.json is:**
- ✅ Manually created and maintained by you
- ✅ Controls filtering and organization
- ✅ Instance-specific (NEAR vs Conflux have different configs)
- ✅ Used at runtime to generate indices from database

**The doc-index.config.json is NOT:**
- ❌ Auto-generated from your docs
- ❌ Synced from Git
- ❌ Created by the LLM
- ❌ Updated automatically

**Think of it like:**
- `doc-index.config.json` = Your filter/organization rules (static)
- `document_pages` table = Your actual documentation (dynamic, from Git)
- `generateIndex()` = Applies rules to docs to create filtered index
- LLM prompt = Uses filtered index to understand available docs
