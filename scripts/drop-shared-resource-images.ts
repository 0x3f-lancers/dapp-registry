/**
 * Remove `image` from resources that share it with another resource on the
 * same app.
 *
 * A CMS with no featured image on a post falls back to a site-wide default, so
 * every article on that blog reports the same og:image. tellor.io hands out
 * logo512.png for all three of its posts, which renders as three identical
 * cards showing the company logo instead of article artwork.
 *
 * The filename heuristic in fetch-resource-images.ts catches the ones actually
 * named "logo" or "default". This catches the rest, because the giveaway is not
 * the name -- it is that one image is standing in for several different
 * articles. Dropping it lets the site fall back to its own placeholder art,
 * which at least differs from card to card.
 *
 * Usage:
 *   tsx scripts/drop-shared-resource-images.ts [--dry-run]
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const APPS = path.resolve('src/apps');

type Resource = { url: string; image?: string; [k: string]: unknown };
type Meta = { resources?: Resource[]; [k: string]: unknown };

async function main() {
  const slugs = await fs.readdir(APPS);
  let appsChanged = 0;
  let imagesDropped = 0;
  const examples: string[] = [];

  for (const slug of slugs) {
    const file = path.join(APPS, slug, 'meta.json');

    let meta: Meta;
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf-8');
      meta = JSON.parse(raw);
    } catch {
      continue;
    }

    const resources = meta.resources ?? [];
    if (resources.length < 2) continue;

    // Count how many resources each image URL is doing duty for.
    const uses = new Map<string, number>();
    for (const r of resources) {
      if (r.image) uses.set(r.image, (uses.get(r.image) ?? 0) + 1);
    }

    const shared = new Set(
      [...uses.entries()].filter(([, n]) => n > 1).map(([url]) => url),
    );
    if (!shared.size) continue;

    let dropped = 0;
    for (const r of resources) {
      if (r.image && shared.has(r.image)) {
        delete r.image;
        dropped++;
      }
    }
    if (!dropped) continue;

    appsChanged++;
    imagesDropped += dropped;
    if (examples.length < 8) examples.push(`${slug} (${dropped})`);

    if (!dryRun) {
      // Preserve the file's trailing newline convention.
      const ends = raw.endsWith('\n') ? '\n' : '';
      await fs.writeFile(file, JSON.stringify(meta, null, 2) + ends, 'utf-8');
    }
  }

  console.log(dryRun ? 'DRY RUN, nothing written' : 'written');
  console.log(`apps changed  : ${appsChanged}`);
  console.log(`images dropped: ${imagesDropped}`);
  console.log(`examples      : ${examples.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
