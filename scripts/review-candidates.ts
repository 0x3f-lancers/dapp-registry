/**
 * Render discovery output as a compact digest for the quality pass.
 *
 * The candidates file is far too large to read directly. This ranks apps by
 * how promising their material looks, then prints just enough per post --
 * title, date, length, the site's own description -- to decide keep/drop and
 * draft a TLDR without opening every page.
 *
 * Usage:
 *   tsx scripts/review-candidates.ts --offset 0 --apps 20
 *   tsx scripts/review-candidates.ts --min-candidates 2 --apps 40
 */

import { promises as fs } from 'fs';
import path from 'path';

interface ArticleCandidate {
  url: string;
  title: string;
  description: string;
  publishedAt: string | null;
  wordCount: number;
  excerpt: string;
  rejected: string | null;
}

interface AppResult {
  slug: string;
  name: string;
  website: string | null;
  status: string;
  candidates: ArticleCandidate[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Titles shaped like an explanation rather than an announcement. */
const EXPLAINER_TITLE =
  /\b(how (it |they |the )?works?|how to|what is|what are|why|explained|explainer|deep dive|introduction|intro to|guide|primer|understanding|behind the|under the hood|breakdown|101|mechanics|architecture)\b/i;

/**
 * Does this post explain the app itself, rather than the wider space?
 *
 * These are the most valuable entries: a page about 0x benefits far more from
 * "how 0x routing works" than from a general piece on DEX aggregation. Matched
 * on the app's own name appearing in the title, ignoring very short names
 * where a coincidental hit means nothing.
 */
function isAboutApp(title: string, name: string, slug: string): boolean {
  const needles = [name, slug.replace(/-/g, ' '), slug.replace(/-/g, '')]
    .map((n) => n.toLowerCase().trim())
    .filter((n) => n.length >= 4);

  // Most blogs append their own name to every <title> ("... - KyberSwap Blog"),
  // which would mark every post as app-specific. Drop trailing separator
  // segments before matching so only a real mention in the headline counts.
  const t = title
    .toLowerCase()
    .split(/\s+[-|–—]\s+/)[0]
    .trim();

  return needles.some((n) => t.includes(n));
}

/**
 * How promising an app's material looks. Longer, more recent, better-described
 * posts score higher -- these are only heuristics to order the review queue,
 * not a substitute for actually reading them.
 */
function scoreApp(
  kept: ArticleCandidate[],
  name: string,
  slug: string,
): number {
  let score = kept.length * 2;
  for (const c of kept) {
    if (c.wordCount >= 1200) score += 3;
    else if (c.wordCount >= 700) score += 2;
    else score += 1;
    if (c.description.length > 80) score += 1;
    if (c.publishedAt && c.publishedAt >= '2026-01-01') score += 2;
    if (EXPLAINER_TITLE.test(c.title)) score += 2;
    // Weighted hardest: a post that explains this app specifically.
    if (isAboutApp(c.title, name, slug)) score += 5;
  }
  return score;
}

async function main() {
  const inPath = path.resolve(arg('in') ?? 'data/resource-candidates.json');
  const results: AppResult[] = JSON.parse(await fs.readFile(inPath, 'utf-8'));

  const minCandidates = Number(arg('min-candidates') ?? 2);
  const offset = Number(arg('offset') ?? 0);
  const appsWanted = Number(arg('apps') ?? 20);

  const ranked = results
    .map((r) => ({ r, kept: r.candidates.filter((c) => !c.rejected) }))
    .filter((x) => x.kept.length >= minCandidates)
    .map((x) => ({ ...x, score: scoreApp(x.kept, x.r.name, x.r.slug) }))
    .sort((a, b) => b.score - a.score || a.r.slug.localeCompare(b.r.slug));

  console.log(
    `# ${ranked.length} apps have >=${minCandidates} surviving candidates ` +
      `(showing ${offset}..${offset + appsWanted})\n`,
  );

  // --compact trades the long excerpts for many more apps per screen, which is
  // what you want once you're grinding through the tail of the ranking.
  const compact = process.argv.includes('--compact');
  const descLen = compact ? 130 : 260;
  const perApp = compact ? 5 : 6;

  for (const { r, kept, score } of ranked.slice(offset, offset + appsWanted)) {
    console.log(`\n=== ${r.slug} [${r.name}] score=${score}`);
    for (const c of kept.slice(0, perApp)) {
      const desc = (c.description || c.excerpt)
        .replace(/\s+/g, ' ')
        .slice(0, descLen);
      // Flag posts that name the app: those explain the product itself and
      // are worth more on its page than another general-interest piece.
      const mark = isAboutApp(c.title, r.name, r.slug) ? '[APP] ' : '';
      if (compact) {
        console.log(
          `  ${mark}${c.publishedAt ?? 'nodate'} ${c.wordCount}w ${c.title}`,
        );
        console.log(`   ${c.url}`);
        if (desc) console.log(`   > ${desc}`);
      } else {
        console.log(
          `  * ${c.publishedAt ?? 'nodate'} ${String(c.wordCount).padStart(5)}w  ${c.title}`,
        );
        console.log(`    ${c.url}`);
        if (desc) console.log(`    > ${desc}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
