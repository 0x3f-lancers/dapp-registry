# Lancers Dapp Registry

A curated Web3 application registry featuring 2300+ decentralized applications with structured metadata, filtering capabilities, and JSON endpoints for discovery and integrations.

## Features

- **Curated DApp Catalog**: Structured metadata for thousands of Web3 applications
- **Multi-chain Support**: Apps indexed across Ethereum, Polygon, Arbitrum, Base, Solana, and 100+ networks
- **Faceted Search**: Filter by network, category, subcategory, and tags
- **Static JSON API**: GitHub Pages-hosted endpoints for zero-infrastructure consumption
- **Cloudinary Integration**: Automatic logo optimization and CDN hosting
- **Schema Validation**: Zod-based validation ensures data integrity

## Quick Start

```bash
# Install dependencies
pnpm install

# Validate all metadata
pnpm run dev:validate

# Generate runtime indexes
pnpm run dev:distill

# Build site bundle
pnpm run dev:build:site

# Run tests
pnpm test
```

## Architecture

### Data Pipeline

```
src/apps/<slug>/meta.json     # Source of truth
         │
         ▼
    [Validation]              # Schema + relation checks
         │
         ▼
    [Distillation]            # Logo upload, index generation
         │
         ▼
build/apps.min.json           # Minified app index
build/facets.index.json       # Filterable facets with buckets
         │
         ▼
    [Site Build]              # Copy to publish structure
         │
         ▼
build/                        # GitHub Pages bundle
├── index.html
├── overview.json
├── dapps/apps.min.json
├── facets/facets.index.json
├── apps/<slug>/meta.json
└── docs/meta-pattern.json
```

### Directory Structure

```
├── src/apps/              # Source DApp metadata (2300+ apps)
│   └── <slug>/
│       └── meta.json
├── build/                 # Generated output (deployed to GitHub Pages)
├── data/                  # Reference data (taxonomy, chain logos)
├── schema/                # Zod schema definitions
├── scripts/               # Build and validation scripts
├── lib/                   # Shared utilities
├── routes/                # Fastify API routes
└── tests/                 # Jest test suites
```

## API Endpoints

### Static JSON (GitHub Pages)

| Endpoint                    | Description                         |
| --------------------------- | ----------------------------------- |
| `/overview.json`            | Registry metadata and endpoint map  |
| `/dapps/apps.min.json`      | Minified index of all apps          |
| `/facets/facets.index.json` | Filterable options with app buckets |
| `/apps/{slug}/meta.json`    | Full metadata for individual app    |
| `/docs/meta-pattern.json`   | Schema documentation                |

### Fastify Server (Development)

```bash
pnpm run dev  # Start server on port 3000
```

| Endpoint      | Method | Description           |
| ------------- | ------ | --------------------- |
| `/`           | GET    | Health check          |
| `/api/filter` | GET    | Filter apps by facets |
| `/revalidate` | POST   | HMAC-verified webhook |

**Filter Query Parameters:**

- `network` - Filter by blockchain (e.g., `ethereum`, `polygon`)
- `category` - Filter by category slug
- `subcategory` - Filter by subcategory slug

Example: `/api/filter?network=ethereum&category=defi-dapps`

## Data Structures

### meta.json (Source)

Each app has a `meta.json` file in `src/apps/<slug>/`:

```json
{
  "slug": "aave",
  "name": "Aave",
  "logoUrl": "https://res.cloudinary.com/.../aave.png",
  "category": "DeFi Dapps",
  "subcategory": ["Decentralized Lending Dapps"],
  "chains": ["Ethereum", "Polygon", "Arbitrum"],
  "tags": ["Decentralized Lending Dapps", "Open-source"],
  "pricing": "",
  "content": {
    "short": "Brief description (max 200 chars)",
    "description": "Full description",
    "meta": "SEO meta description (max 200 chars)",
    "pageTitle": "Page title for SEO"
  },
  "links": {
    "website": "https://aave.com/",
    "github": "https://github.com/aave",
    "docs": "https://docs.aave.com/",
    "twitter": "https://twitter.com/aaborrrowed",
    "discord": "https://discord.gg/aave"
  },
  "relations": {
    "alternatives": ["compound", "maker"],
    "related": ["uniswap", "curve"]
  }
}
```

### apps.min.json (Generated)

Minified index with essential fields for listing:

```json
[
  {
    "slug": "aave",
    "name": "Aave",
    "logoUrl": "https://...",
    "category": "DeFi Dapps",
    "subcategory": ["Decentralized Lending Dapps"],
    "chains": ["Ethereum", "Polygon"],
    "tags": ["Decentralized Lending Dapps"],
    "pricing": "",
    "short": "Brief description",
    "updatedAt": "2025-02-12T10:00:00.000Z"
  }
]
```

### facets.index.json (Generated)

Faceted search index with filter options and app buckets:

```json
{
  "filterableOptions": {
    "network": [{ "slug": "ethereum", "label": "Ethereum", "stats": 1500 }],
    "category": [{ "slug": "defi-dapps", "label": "DeFi Dapps", "stats": 800 }],
    "subcategory": [...],
    "tags": [...]
  },
  "buckets": {
    "network": { "ethereum": ["aave", "uniswap", ...] },
    "category": { "defi-dapps": ["aave", "compound", ...] },
    "subcategory": {...},
    "tags": {...}
  },
  "stats": 2369,
  "counts": {
    "apps": 2369,
    "networks": 120,
    "categories": 15,
    "subcategories": 85
  },
  "labels": {...},
  "assets": { "networkLogos": {...} },
  "taxonomy": {...}
}
```

## Environment Variables

Create `.env.local` for local development:

```bash
# Cloudinary (required for logo upload during distillation)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# HMAC verification (optional, for webhook endpoint)
HMAC_SECRET=your-hmac-secret

# Server port (optional, defaults to 3000)
PORT=3000
```

## Scripts Reference

| Script                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `pnpm run dev`            | Start Fastify dev server with tsx            |
| `pnpm run dev:validate`   | Validate all meta.json files                 |
| `pnpm run dev:distill`    | Generate apps.min.json and facets.index.json |
| `pnpm run dev:build:site` | Build GitHub Pages bundle                    |
| `pnpm run build`          | Compile TypeScript to dist/                  |
| `pnpm run start`          | Run compiled server                          |
| `pnpm test`               | Run Jest test suite                          |

## CI/CD Workflows

| Workflow                     | Trigger       | Action                             |
| ---------------------------- | ------------- | ---------------------------------- |
| `validate.yml`               | Pull requests | Validates metadata against schema  |
| `distill-and-revalidate.yml` | Push to main  | Regenerates indexes, uploads logos |
| `build-and-deploy.yml`       | Push to main  | Builds and deploys to GitHub Pages |

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- tests/validate.test.ts

# Run with coverage
pnpm test -- --coverage
```

Test suites cover:

- Schema validation (`schema.test.ts`)
- Metadata validation logic (`validate.test.ts`)
- Filter utilities (`filterUtils.test.ts`)
- Cloudinary integration (`cloudinary.test.ts`)

## Contributing

See [CONTRIBUTION.md](./CONTRIBUTION.md) for detailed contribution guidelines.

## License

MIT
