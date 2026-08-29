/**
 * Pull the latest posts from independent crypto publishers.
 *
 * The per-app `resources` field only ever holds first-party writing: a
 * project's own blog. That leaves out the research outlets which produce the
 * best general education (a16z crypto, Paradigm, Variant), because they are
 * publishers rather than dapps and so appear nowhere in the registry.
 *
 * This fetches those sources directly. Each run re-reads the publisher's index
 * page, so it always reflects what they have published most recently.
 *
 * Usage:
 *   tsx scripts/fetch-editorial.ts --limit 40
 *   tsx scripts/fetch-editorial.ts --source a16z-crypto --limit 60
 *
 * Output: data/editorial-candidates.json
 */

import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USER_AGENT =
  'LancersDappRegistry/1.0 (+https://github.com/0x3f-lancers/dapp-registry) editorial-discovery';
const FETCH_TIMEOUT_MS = 20_000;
const PER_REQUEST_DELAY_MS = 350;

interface Source {
  id: string;
  /** Human label written into `source` on the resource entry. */
  name: string;
  /** Page listing every post. */
  indexUrl: string;
  origin: string;
  /** Which links on that page are actually articles. */
  articlePattern: RegExp;
}

/**
 * a16z publishes a full HTML index at /sitemap (not an XML sitemap -- the
 * .xml paths 404), listing well over a thousand posts under /posts/article/.
 */
const SOURCES: Source[] = [
  {
    id: 'a16z-crypto',
    name: 'a16z crypto',
    indexUrl: 'https://a16zcrypto.com/sitemap',
    origin: 'https://a16zcrypto.com',
    articlePattern: /^\/posts\/article\/[a-z0-9][a-z0-9-]{6,}$/i,
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const metaContent = (html: string, patterns: RegExp[]): string => {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return '';
};

function normaliseDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  return iso > '1990-01-01' ? iso : null;
}

/** Strip chrome, then keep the prose. */
function bodyText(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  const paras = [...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((t) => t.split(/\s+/).length >= 12);

  return paras.join('\n');
}

/**
 * Same editorial bar as the per-app crawler: no promos, nothing thin.
 *
 * A publisher's index mixes research in with portfolio announcements and team
 * pages. "Investing in <company>" is a16z's standard funding-announcement
 * format and carries no teaching value, so it goes early.
 */
const PROMO_TITLE =
  /\b(announcing|now live|introducing our|we're hiring|join us|apply (to|now)|recap|newsletter|podcast episode|weekly update|jobs?|cohort|is expanding to)\b|^investing in /i;

/** Team bio pages are titled with just a person's name. */
const PERSON_PAGE = /^[A-Z][a-z'-]+(?: [A-Z][a-z'.-]+){1,2}$/;

interface EditorialPost {
  sourceId: string;
  source: string;
  url: string;
  title: string;
  description: string;
  publishedAt: string | null;
  wordCount: number;
  excerpt: string;
  rejected: string | null;
}

async function collectArticleUrls(src: Source): Promise<string[]> {
  const html = await fetchText(src.indexUrl);
  if (!html) return [];

  const urls = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], src.origin);
    } catch {
      continue;
    }
    if (u.origin !== src.origin) continue;
    const p = u.pathname.replace(/\/$/, '');
    if (src.articlePattern.test(p)) urls.add(src.origin + p);
  }
  return [...urls];
}

async function extractPost(
  src: Source,
  url: string,
): Promise<EditorialPost | null> {
  const html = await fetchText(url);
  await sleep(PER_REQUEST_DELAY_MS);
  if (!html) return null;

  // Match the closing quote to the opening one. A single [\"'] character class
  // on both ends stops at the first apostrophe *inside* the content, which
  // silently truncates any title containing one ("It's..." became "It").
  const title = metaContent(html, [
    /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
    /<meta[^>]+property='og:title'[^>]+content='([^']+)'/i,
    /<meta[^>]+name="twitter:title"[^>]+content="([^"]+)"/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ]);
  const description = metaContent(html, [
    /<meta[^>]+name="description"[^>]+content="([^"]*)"/i,
    /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i,
    /<meta[^>]+name='description'[^>]+content='([^']*)'/i,
  ]);
  const publishedAt = normaliseDate(
    metaContent(html, [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /"datePublished"\s*:\s*"([^"]+)"/i,
      /<time[^>]+datetime=["']([^"']+)["']/i,
    ]),
  );

  const text = bodyText(html);
  const wordCount = text ? text.split(/\s+/).length : 0;

  // Publishers suffix their name onto <title>; strip it before judging.
  const bareTitle = title.replace(new RegExp(`\\s*[-|]\\s*${src.name}\\s*$`, 'i'), '').trim();

  let rejected: string | null = null;
  if (!bareTitle) rejected = 'no-title';
  else if (wordCount < 400) rejected = `too-short(${wordCount}w)`;
  else if (PROMO_TITLE.test(bareTitle)) rejected = 'promo';
  else if (PERSON_PAGE.test(bareTitle)) rejected = 'team-bio';

  return {
    sourceId: src.id,
    source: src.name,
    url,
    title: bareTitle.slice(0, 200),
    description: description.slice(0, 400),
    publishedAt,
    wordCount,
    excerpt: text.slice(0, 1500),
    rejected,
  };
}

async function main() {
  const wanted = arg('source');
  const limit = Number(arg('limit') ?? 40);
  const concurrency = Number(arg('concurrency') ?? 6);
  const outPath = path.resolve(
    arg('out') ?? path.join(DATA_DIR, 'editorial-candidates.json'),
  );

  const sources = wanted ? SOURCES.filter((s) => s.id === wanted) : SOURCES;
  if (!sources.length) throw new Error(`unknown source: ${wanted}`);

  const all: EditorialPost[] = [];

  for (const src of sources) {
    const urls = await collectArticleUrls(src);
    console.log(`${src.id}: ${urls.length} article urls on the index page`);

    // The index is ordered alphabetically, not by date, so a slice of it is an
    // arbitrary sample rather than the newest work. Fetch everything (capped),
    // then let the date sort below decide what is actually recent.
    const scan = Number(arg('scan') ?? 700);
    const targets = urls.slice(0, scan);
    const posts: EditorialPost[] = [];
    let cursor = 0;
    let done = 0;

    async function worker() {
      while (cursor < targets.length) {
        const url = targets[cursor++];
        const p = await extractPost(src, url);
        if (p) posts.push(p);
        done++;
        if (done % 20 === 0) console.log(`  ${done}/${targets.length}`);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, targets.length) }, worker),
    );

    posts.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    // `--limit` is how many posts to keep per source, applied after the date
    // sort so it keeps the newest rather than an arbitrary slice of the index.
    // It is separate from `--scan`, which caps how many pages get fetched.
    all.push(...posts.slice(0, limit));
    console.log(
      `${src.id}: kept ${posts.filter((p) => !p.rejected).length}/${posts.length}`,
    );
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString().slice(0, 10), posts: all },
      null,
      2,
    ),
    'utf-8',
  );

  console.log(`\ntotal: ${all.length} | usable: ${all.filter((p) => !p.rejected).length}`);
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
