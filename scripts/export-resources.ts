/**
 * Export every curated resource currently in the registry as one JSON file.
 *
 * Reads from src/apps/<slug>/meta.json rather than the batch selection files,
 * so the output always reflects what is actually on disk -- including anything
 * edited by hand after it was applied.
 *
 * Usage: tsx scripts/export-resources.ts [--out data/resources-added.json]
 */

import { promises as fs } from 'fs';
import path from 'path';

const APPS_DIR = path.resolve(process.cwd(), 'src', 'apps');

interface Resource {
  title: string;
  tldr: string;
  url: string;
  source: string;
  publishedAt?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slugs = (await fs.readdir(APPS_DIR)).sort();

  const apps: {
    slug: string;
    name: string;
    website: string;
    category: string;
    resourceCount: number;
    resources: Resource[];
  }[] = [];

  for (const slug of slugs) {
    let meta: {
      name?: string;
      category?: string;
      links?: { website?: string; github?: string };
      resources?: Resource[];
    };
    try {
      meta = JSON.parse(
        await fs.readFile(path.join(APPS_DIR, slug, 'meta.json'), 'utf-8'),
      );
    } catch {
      continue;
    }
    if (!meta.resources?.length) continue;

    apps.push({
      slug,
      name: meta.name ?? slug,
      // A handful of registry entries carry only a github link.
      website: meta.links?.website ?? meta.links?.github ?? '',
      category: meta.category ?? '',
      resourceCount: meta.resources.length,
      resources: meta.resources,
    });
  }

  const totalResources = apps.reduce((n, a) => n + a.resourceCount, 0);

  // Distinct publishers, so it's obvious at a glance how spread out the
  // sourcing is rather than concentrated on a handful of blogs.
  const bySource: Record<string, number> = {};
  for (const a of apps) {
    for (const r of a.resources) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    summary: {
      appsWithResources: apps.length,
      totalResources,
      totalAppsInRegistry: slugs.length,
      distinctSources: Object.keys(bySource).length,
      uniqueUrls: new Set(apps.flatMap((a) => a.resources.map((r) => r.url)))
        .size,
    },
    sources: Object.fromEntries(
      Object.entries(bySource).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
    apps,
  };

  const outPath = path.resolve(arg('out') ?? 'data/resources-added.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');

  console.log(`apps: ${apps.length}`);
  console.log(`resources: ${totalResources}`);
  console.log(`distinct sources: ${out.summary.distinctSources}`);
  console.log(`unique urls: ${out.summary.uniqueUrls}`);
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
