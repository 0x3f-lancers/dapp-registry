/**
 * Write curated resources into per-app meta.json files.
 *
 * Input is a selections file -- the output of the human/model quality pass --
 * shaped as { "<slug>": [ { title, tldr, url, source, publishedAt? }, ... ] }.
 * Anything not in that file is left alone, so apps without good material
 * simply never gain the field.
 *
 * Usage:
 *   tsx scripts/apply-resources.ts --in data/resource-selections.json
 *   tsx scripts/apply-resources.ts --in ... --dry-run
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

interface Selection {
  title: string;
  tldr: string;
  url: string;
  source: string;
  publishedAt?: string;
}

/**
 * Strip campaign tracking from outbound links.
 *
 * Feed-derived URLs routinely carry ?utm_source=rss and friends. They resolve
 * fine, but publishing them attributes our traffic to the source's own RSS
 * campaign and makes the link ugly. Applied after crawl verification, so the
 * check still matches on the URL we actually fetched.
 */
function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|ref)$/i.test(key) || key.startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    u.hash = '';
    return u.toString().replace(/\?$/, '');
  } catch {
    return raw;
  }
}

/**
 * Every URL must come from the crawl.
 *
 * Selections are written by hand from a digest, which makes it far too easy to
 * reconstruct a plausible-looking URL from the title instead of copying the
 * real one. Those 404 silently on the live site, so cross-check against the
 * discovery output before anything is written.
 */
async function loadCrawledUrls(candidatePaths: string): Promise<Set<string>> {
  const urls = new Set<string>();

  // Accepts both discovery outputs: the per-app crawl (an array of apps, each
  // with candidates) and the editorial crawl ({ posts: [...] }).
  for (const p of candidatePaths.split(',').map((s) => s.trim()).filter(Boolean)) {
    const parsed = JSON.parse(await fs.readFile(path.resolve(p), 'utf-8'));

    if (Array.isArray(parsed)) {
      for (const app of parsed as { candidates?: { url: string }[] }[]) {
        for (const c of app.candidates ?? []) urls.add(c.url);
      }
    } else if (Array.isArray((parsed as { posts?: unknown }).posts)) {
      for (const post of (parsed as { posts: { url: string }[] }).posts) {
        urls.add(post.url);
      }
    }
  }
  return urls;
}

async function main() {
  const inPath = path.resolve(
    arg('in') ?? 'data/resource-selections.json',
  );
  const selections: Record<string, Selection[]> = JSON.parse(
    await fs.readFile(inPath, 'utf-8'),
  );

  // Comma-separate to check against several crawls at once.
  const verifyPath = arg('verify-against');
  const knownUrls = verifyPath ? await loadCrawledUrls(verifyPath) : null;

  let written = 0;
  let skipped = 0;
  const problems: string[] = [];
  const seenUrls = new Set<string>();

  for (const [slug, resources] of Object.entries(selections)) {
    if (!resources?.length) {
      skipped++;
      continue;
    }

    const metaPath = path.join(APPS_DIR, slug, 'meta.json');
    let raw: string;
    try {
      raw = await fs.readFile(metaPath, 'utf-8');
    } catch {
      problems.push(`${slug}: meta.json not found`);
      continue;
    }

    // The same post must not be reused across apps -- that would be exactly
    // the duplicated-boilerplate signal this whole field exists to avoid.
    let badUrl = false;
    for (const r of resources) {
      if (seenUrls.has(r.url)) problems.push(`${slug}: duplicate url ${r.url}`);
      seenUrls.add(r.url);

      if (knownUrls && !knownUrls.has(r.url)) {
        problems.push(`${slug}: url not found in crawl (invented?) ${r.url}`);
        badUrl = true;
      }
    }
    if (badUrl) continue;

    const meta = JSON.parse(raw);
    const next = {
      ...meta,
      resources: resources.map((r) => ({ ...r, url: cleanUrl(r.url) })),
    };

    // Validate before writing so a bad TLDR length or URL never lands on disk.
    const parsed = metaJsonSchema.safeParse(next);
    if (!parsed.success) {
      problems.push(
        `${slug}: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      );
      continue;
    }

    if (!dryRun) {
      // Write the original object plus resources (not the Zod output) so
      // unrelated formatting and any fields we don't model stay intact.
      await fs.writeFile(metaPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
    }
    written++;
  }

  console.log(`${dryRun ? '[dry-run] would write' : 'wrote'}: ${written} apps`);
  if (skipped) console.log(`skipped (empty selection): ${skipped}`);
  if (problems.length) {
    console.log(`\nproblems (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
