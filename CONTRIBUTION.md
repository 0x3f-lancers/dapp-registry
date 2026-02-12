# Contribution Guide

Thank you for contributing to the Lancers Dapp Registry! This guide covers everything you need to know to add, update, or improve DApp entries.

## Table of Contents

- [Source of Truth](#source-of-truth)
- [Adding a New DApp](#adding-a-new-dapp)
- [Updating an Existing DApp](#updating-an-existing-dapp)
- [meta.json Schema Reference](#metajson-schema-reference)
- [Validation Rules](#validation-rules)
- [Local Development](#local-development)
- [Pull Request Process](#pull-request-process)
- [Common Issues](#common-issues)

## Source of Truth

- **Edit only**: `src/apps/<slug>/meta.json`
- **Never edit**: Files in `build/` (these are auto-generated)
- **Schema definitions**: `schema/metaJsonSchema.ts`

## Adding a New DApp

### Step 1: Create the App Directory

```bash
mkdir src/apps/your-app-slug
```

The slug must be:
- Lowercase
- Use hyphens for spaces (e.g., `my-awesome-dapp`)
- Unique across all apps
- Match the `slug` field in meta.json exactly

### Step 2: Create meta.json

Create `src/apps/your-app-slug/meta.json` with the following structure:

```json
{
  "slug": "your-app-slug",
  "name": "Your App Name",
  "logoUrl": "logo.png",
  "category": "DeFi Dapps",
  "subcategory": ["Decentralized Exchanges"],
  "chains": ["Ethereum", "Polygon"],
  "tags": ["DEX", "AMM"],
  "pricing": "Free",
  "content": {
    "short": "A brief one-line description (max 200 characters).",
    "description": "A comprehensive description of the DApp, its features, and use cases. Can be multiple paragraphs.",
    "meta": "SEO-friendly meta description (max 200 characters).",
    "pageTitle": "Your App - Category - Lancers Web3 Explorer"
  },
  "links": {
    "website": "https://yourapp.com/",
    "github": "https://github.com/yourorg/yourapp",
    "docs": "https://docs.yourapp.com/",
    "twitter": "https://twitter.com/yourapp",
    "discord": "https://discord.gg/yourapp",
    "telegram": "https://t.me/yourapp"
  },
  "relations": {
    "alternatives": [],
    "related": []
  }
}
```

### Step 3: Add Logo

**Option A: Local logo file**

Place logo in the same directory:
```
src/apps/your-app-slug/
├── meta.json
└── logo.png
```

Set `logoUrl` to the filename:
```json
"logoUrl": "logo.png"
```

During distillation, the logo will be uploaded to Cloudinary and the URL will be updated automatically.

**Option B: External URL**

Provide a direct URL to the logo:
```json
"logoUrl": "https://example.com/logo.png"
```

**Option C: Cloudinary URL (already uploaded)**

If already on Cloudinary:
```json
"logoUrl": "https://res.cloudinary.com/lancers-technology/image/upload/..."
```

### Step 4: Add Relations (Optional)

Reference other apps by their slug:

```json
"relations": {
  "alternatives": ["competitor-app", "similar-app"],
  "related": ["complementary-app", "partner-app"]
}
```

All referenced slugs must exist in `src/apps/`.

### Step 5: Validate

```bash
pnpm run dev:validate
```

Fix any errors before proceeding.

## Updating an Existing DApp

1. Locate the app: `src/apps/<slug>/meta.json`
2. Make your changes
3. Run validation: `pnpm run dev:validate`
4. Submit a pull request

## meta.json Schema Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Unique identifier, must match folder name |
| `name` | string | Display name |
| `logoUrl` | string | Logo URL or local filename |
| `category` | string | Primary category |
| `subcategory` | string[] | List of subcategories |
| `chains` | string[] | Supported blockchains |
| `tags` | string[] | Searchable tags |
| `pricing` | string | Pricing model (e.g., "Free", "Freemium", "Paid") |
| `content.short` | string | Brief description (max 200 chars) |
| `content.description` | string | Full description |
| `content.meta` | string | SEO meta description (max 200 chars) |
| `content.pageTitle` | string | Page title for SEO |
| `links` | object | At least `website` or `github` required |
| `relations` | object | Contains `alternatives` and `related` arrays |

### Links Object

All link fields are optional, but at least one of `website` or `github` is required:

| Field | Description |
|-------|-------------|
| `website` | Official website URL |
| `github` | GitHub repository URL |
| `docs` | Documentation URL |
| `twitter` | Twitter/X profile URL |
| `discord` | Discord invite URL |
| `telegram` | Telegram channel/group URL |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `source.fullyScraped` | boolean | Internal flag for data completeness |

### Categories

Common categories include:
- DeFi Dapps
- NFT Dapps
- Gaming Dapps
- Social Dapps
- Infrastructure
- Developer Tools
- DAOs
- Metaverse

### Chains

Use official chain names:
- Ethereum
- Polygon
- Arbitrum
- Optimism (or "OP Mainnet")
- Base
- Avalanche
- Solana
- BNB Chain
- Fantom
- etc.

## Validation Rules

The validation script checks:

1. **Schema Compliance**: All required fields present with correct types
2. **Slug Match**: `slug` field matches folder name exactly
3. **Relation Integrity**: All slugs in `alternatives` and `related` exist in `src/apps/`
4. **Content Length**: `content.short` and `content.meta` are under 200 characters
5. **Link Requirements**: At least one of `website` or `github` is provided
6. **URL Format**: All link URLs are valid

## Local Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Install dependencies
pnpm install

# Create environment file (optional, for distillation)
cp .env.local.example .env.local
# Edit .env.local with Cloudinary credentials
```

### Development Commands

```bash
# Validate all metadata
pnpm run dev:validate

# Generate runtime indexes (requires Cloudinary for logo upload)
pnpm run dev:distill

# Build site bundle
pnpm run dev:build:site

# Run tests
pnpm test

# Run single test file
pnpm test -- tests/validate.test.ts

# Start development server
pnpm run dev
```

### Testing Your Changes

1. **Validate metadata**:
   ```bash
   pnpm run dev:validate
   ```

2. **Run distillation** (optional, requires Cloudinary):
   ```bash
   pnpm run dev:distill
   ```

3. **Run tests**:
   ```bash
   pnpm test
   ```

## Pull Request Process

### Before Submitting

- [ ] Slug matches folder name exactly
- [ ] All required fields are present
- [ ] `content.short` is under 200 characters
- [ ] `content.meta` is under 200 characters
- [ ] At least `website` or `github` link is provided
- [ ] All relation slugs reference existing apps
- [ ] `pnpm run dev:validate` passes
- [ ] `pnpm test` passes

### PR Checklist

- [ ] Changes are only in `src/apps/` (unless modifying scripts/workflows)
- [ ] Validation passes locally
- [ ] Commit message describes the change clearly
- [ ] PR title follows format: `feat: add <app-name>` or `fix: update <app-name> metadata`

### What Happens After Merge

1. **validate.yml**: Runs schema validation (on PR)
2. **distill-and-revalidate.yml**: Uploads logos, generates indexes (on merge)
3. **build-and-deploy.yml**: Deploys to GitHub Pages (on merge)

## Common Issues

### "Slug does not match folder name"

The `slug` field in meta.json must exactly match the folder name:

```
src/apps/my-dapp/meta.json
         ^^^^^^^

{
  "slug": "my-dapp",  ← Must match
  ...
}
```

### "Relation does not exist in src/apps/"

All slugs in `alternatives` and `related` must reference existing apps:

```json
"relations": {
  "alternatives": ["existing-app"],  ← Must exist as src/apps/existing-app/
  "related": []
}
```

Remove non-existent references or add the missing apps first.

### "At least one of 'website' or 'github' is required"

The `links` object must contain at least one of these:

```json
"links": {
  "website": "https://example.com/"  ← At least one required
}
```

### Logo Upload Fails

If distillation fails on logo upload:

1. Check Cloudinary credentials in `.env.local`
2. Ensure the logo file exists at the specified path
3. For external URLs, verify the URL is accessible
4. Logo dimensions should be reasonable (recommended: 256x256 to 512x512)

### Content Too Long

- `content.short` must be ≤ 200 characters
- `content.meta` must be ≤ 200 characters

Trim the content or move details to `content.description`.

## Questions?

Open an issue on GitHub if you need help or have questions about contributing.
