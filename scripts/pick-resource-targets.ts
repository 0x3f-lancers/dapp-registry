/**
 * Choose which apps are worth running resource discovery against.
 *
 * The registry has no popularity signal, so we rank on what the metadata does
 * tell us about whether a project is alive and technical enough to publish
 * real writing: docs + github + a rich description are all decent proxies.
 * Dead/archived projects are dropped -- they will never have a current blog.
 *
 * Usage: tsx scripts/pick-resource-targets.ts --limit 500 --out data/target-slugs.txt
 */

import { promises as fs } from 'fs';
import path from 'path';

const APPS_DIR = path.resolve(process.cwd(), 'src', 'apps');

// Categories whose projects reliably publish engineering/education writing.
const STRONG_CATEGORIES =
  /(defi|infrastructur|developer|oracle|bridge|wallet|dao|identity|zero.?knowledge|real.?world|stablecoin|exchange|lending|staking)/i;

interface Scored {
  slug: string;
  score: number;
  name: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slugs = (await fs.readdir(APPS_DIR)).sort();
  const scored: Scored[] = [];

  for (const slug of slugs) {
    let meta: any;
    try {
      meta = JSON.parse(
        await fs.readFile(path.join(APPS_DIR, slug, 'meta.json'), 'utf-8'),
      );
    } catch {
      continue;
    }

    if (meta.archived) continue;
    const links = meta.links ?? {};
    if (!links.website) continue; // no site => nothing to crawl

    let score = 0;
    if (links.docs) score += 3; // documents things => likely writes things
    if (links.github) score += 2; // active engineering
    if (links.twitter) score += 1;
    if (links.discord || links.telegram) score += 1;

    const desc: string = meta.content?.description ?? '';
    if (desc.length > 600) score += 2;
    else if (desc.length > 350) score += 1;

    if (STRONG_CATEGORIES.test(meta.category ?? '')) score += 2;
    if ((meta.chains?.length ?? 0) >= 3) score += 1; // multi-chain => bigger project

    // Custom domains beat hosted/link-shortener pages.
    if (!/(linktr\.ee|notion\.site|github\.io|medium\.com)/i.test(links.website))
      score += 1;

    scored.push({ slug, score, name: meta.name ?? slug });
  }

  scored.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  const limit = Number(arg('limit') ?? 500);
  const picked = scored.slice(0, limit);
  const outPath = path.resolve(arg('out') ?? 'data/target-slugs.txt');

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    picked.map((p) => p.slug).join('\n') + '\n',
    'utf-8',
  );

  console.log(`scored ${scored.length} live apps`);
  console.log(
    `top score ${picked[0]?.score}, cutoff ${picked[picked.length - 1]?.score}`,
  );
  console.log(`wrote ${picked.length} slugs -> ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
