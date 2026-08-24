# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lancers Dapp Registry is a curated Web3 application registry with structured metadata and JSON endpoints. The system validates, processes, and publishes DApp metadata for discovery and integrations.

## Common Commands

```bash
pnpm install                    # Install dependencies
pnpm run validate           # Validate all meta.json files against schema
pnpm run distill            # Generate apps.min.json and facets.index.json
pnpm run build:site         # Build publishable site bundle to build/
pnpm test                       # Run Jest tests
pnpm test -- tests/validate.test.ts  # Run single test file
```

## Architecture

### Data Flow

1. **Source of Truth**: `src/apps/<slug>/meta.json` - Each DApp has its own folder with a `meta.json` file
2. **Validation** (`scripts/validate.ts`): Validates meta.json files against Zod schema, checks slug matches folder name, verifies relation references exist
3. **Distillation** (`scripts/distill.ts`): Processes meta.json files, uploads logos to Cloudinary, generates `build/apps.min.json` and `build/facets.index.json`
4. **Site Build** (`scripts/build-site.ts`): Copies data to publish structure under `build/`

### Key Directories

- `src/apps/` - Source DApp metadata (2300+ apps)
- `build/` - Generated output (not source-controlled content)
- `schema/` - Zod schema definitions for validation
- `scripts/` - Build/validation scripts
- `lib/` - Shared utilities (Cloudinary upload, filtering, logging)
- `data/` - Intermediate data files

### Schema Structure

The `metaJsonSchema` in `schema/metaJsonSchema.ts` defines required fields:
- `slug`, `name`, `logoUrl`, `category`, `subcategory[]`, `chains[]`, `tags[]`, `pricing`
- `content`: `{ short, description, meta, pageTitle }`
- `links`: At least one of `website` or `github` required
- `relations`: `{ alternatives[], related[] }` - must reference existing slugs
- `resources[]` (optional): curated educational reading - see below

**Any field not declared in the schema is silently deleted.** Zod strips unknown
keys, and `distill.ts` writes the parsed object back over `meta.json` whenever it
uploads a logo. Always add a field to the schema before writing it to disk.

### Educational Resources (`resources`)

Optional per-app array of curated further reading, added so dapp detail pages
carry content that is unique to them rather than reading as templated listings.

```jsonc
"resources": [
  {
    "title": "DualPool Hook: A Technical Deep Dive",
    "tldr": "Our own 2-3 sentence summary, never pasted from the source.",
    "url": "https://blog.uniswap.org/dualpool-hook-is-now-live",
    "source": "Uniswap Labs Blog",
    "publishedAt": "2026-07-22"   // optional, YYYY-MM-DD
  }
]
```

Rules that matter:
- **Quality over coverage.** Most apps should have no `resources` field at all.
  Filling every app with thin summaries recreates the templated-content problem
  this field exists to solve.
- **Never copy the source's own text** into `tldr` - duplicate content defeats
  the purpose. Write it fresh, and vary the phrasing between entries.
- **Never add `resources` to `appsMinSchema` or distill's `appEntry`.**
  `apps.min.json` is fetched by every listing page; this data belongs only on
  the detail page, which reads the per-app `meta.json`.
- Max 5 entries, `tldr` 40-300 chars.

Pipeline:
```bash
tsx scripts/pick-resource-targets.ts --limit 2600   # rank apps worth crawling
tsx scripts/fetch-resources.ts --file data/target-slugs.txt --concurrency 24
tsx scripts/review-candidates.ts --apps 20          # compact digest to review
# ...hand-pick posts and write TLDRs into data/resource-selections.json...
tsx scripts/apply-resources.ts --in data/resource-selections.json --dry-run
tsx scripts/apply-resources.ts --in data/resource-selections.json
pnpm run validate
```

### Fastify Server

`index.ts` provides a simple API server with:
- `/api/filter` - Filter apps by network, category, subcategory, tags
- `/revalidate` - HMAC-verified webhook endpoint

### CI Workflows

- `validate.yml` - Runs validation on PRs
- `distill-and-revalidate.yml` - Processes metadata changes
- `build-and-deploy.yml` - Builds and deploys to GitHub Pages

## Adding/Modifying Apps

1. Create/edit `src/apps/<slug>/meta.json`
2. Ensure `slug` matches folder name exactly
3. Ensure all relations reference existing slugs
4. Run `pnpm run validate` before committing
