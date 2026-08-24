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
