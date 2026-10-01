/**
 * Patch existing TLDRs in place, keyed by resource URL.
 *
 * Used after re-reading an article's real body text: the summary changes but
 * the title, link and source stay exactly as they were. Every URL in the
 * corrections file must already exist in the registry, so a typo fails loudly
 * instead of silently doing nothing.
 *
 * Usage:
 *   tsx scripts/update-tldrs.ts --in data/_tldr-corrections.json [--dry-run]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { metaJsonSchema } from '../schema/metaJsonSchema';

const APPS_DIR = path.resolve(process.cwd(), 'src', 'apps');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const inPath = path.resolve(arg('in') ?? 'data/_tldr-corrections.json');
  const corrections: Record<string, string> = JSON.parse(
    await fs.readFile(inPath, 'utf-8'),
  );

  const applied = new Set<string>();
  let filesChanged = 0;
  const problems: string[] = [];

  for (const slug of await fs.readdir(APPS_DIR)) {
    const metaPath = path.join(APPS_DIR, slug, 'meta.json');
    let meta: { resources?: { url: string; tldr: string }[] };
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    } catch {
      continue;
    }
    if (!meta.resources?.length) continue;

    let touched = false;
    for (const r of meta.resources) {
      const next = corrections[r.url];
      if (!next || next === r.tldr) continue;
      r.tldr = next;
      applied.add(r.url);
      touched = true;
    }
    if (!touched) continue;

    const parsed = metaJsonSchema.safeParse(meta);
    if (!parsed.success) {
      problems.push(
        `${slug}: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      );
      continue;
    }

    if (!dryRun) {
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
    }
    filesChanged++;
  }

  const missed = Object.keys(corrections).filter((u) => !applied.has(u));

  console.log(`${dryRun ? '[dry-run] would update' : 'updated'} ${applied.size} tldrs across ${filesChanged} apps`);
  if (missed.length) {
    console.log(`\nURLs not found in registry (${missed.length}):`);
    for (const m of missed) console.log(`  - ${m}`);
    process.exitCode = 1;
  }
  if (problems.length) {
    console.log(`\nvalidation problems (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
