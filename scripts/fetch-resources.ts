/**
 * Educational-resource discovery.
 *
 * Finds candidate blog/research posts for an app by crawling its own site's
 * sitemap, extracts enough of each post to judge it, and drops the obvious
 * junk. It writes a *candidates* file -- it never touches meta.json. The
 * judging ("is this actually worth reading?") and the TLDR writing are done
 * by a human/model pass over that file, because that judgement is the entire
 * point of the field.
 *
 * Usage:
 *   tsx scripts/fetch-resources.ts --slugs uniswap,aave
 *   tsx scripts/fetch-resources.ts --file data/target-slugs.txt --concurrency 8
 *   tsx scripts/fetch-resources.ts --all --limit 200
 *
 * Output: data/resource-candidates.json
 * Cache:  data/.resource-cache/  (delete to force refetch)
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

const APPS_DIR = path.resolve(process.cwd(), 'src', 'apps');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, '.resource-cache');
const DEFAULT_OUT = path.join(DATA_DIR, 'resource-candidates.json');

const USER_AGENT =
  'LancersDappRegistry/1.0 (+https://github.com/0x3f-lancers/dapp-registry) resource-discovery';

// Probes are speculative and most miss, so a slow host must not stall the
// run. Real article fetches that matter are retried on the next pass via the
// on-disk cache.
const FETCH_TIMEOUT_MS = 8_000;
const PER_HOST_DELAY_MS = 150; // still serialised per host, just less idle
const MAX_SITEMAP_URLS = 3_000; // guard against giant sitemaps
const MAX_ARTICLES_PER_APP = 12; // how many we bother extracting
const MIN_WORDS = 400;
const MAX_AGE_MONTHS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArticleCandidate {
  url: string;
  title: string;
  description: string;
  publishedAt: string | null;
  wordCount: number;
  excerpt: string;
  rejected: string | null; // reason, or null if it survived
}

interface AppResult {
  slug: string;
  name: string;
  website: string | null;
  status: 'ok' | 'no-links' | 'no-sitemap' | 'no-editorial-urls' | 'error';
  note?: string;
  sitemapsTried: string[];
  candidates: ArticleCandidate[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
};

/** Serialises requests per host so we never hammer one blog. */
const hostQueues = new Map<string, Promise<unknown>>();
function perHost<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = hostOf(url);
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const out = await fn();
      await sleep(PER_HOST_DELAY_MS);
      return out;
    });
  hostQueues.set(host, next);
  return next as Promise<T>;
}

const cacheKey = (url: string) =>
  crypto.createHash('sha1').update(url).digest('hex') + '.txt';

async function readCache(url: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, cacheKey(url)), 'utf-8');
  } catch {
    return null;
  }
}

async function writeCache(url: string, body: string): Promise<void> {
  try {
    await fs.writeFile(path.join(CACHE_DIR, cacheKey(url)), body, 'utf-8');
  } catch {
    /* cache is best-effort */
  }
}

/**
 * Hosts that failed to connect at all (DNS miss, refused, TLS error).
 *
 * We probe up to ~40 speculative URLs per app across blog./research./mirror.
 * subdomains, most of which don't exist. Without this, every one of those
 * costs a full connection attempt against the same dead host.
 */
const deadHosts = new Set<string>();

/** --no-cache re-fetches everything, ignoring (but still filling) the cache. */
const noCache = process.argv.includes('--no-cache');

/** Fetch with timeout, gzip handling, and an on-disk cache. */
async function fetchText(url: string): Promise<string | null> {
  if (!noCache) {
    const cached = await readCache(url);
    if (cached !== null) return cached === 'MISS' ? null : cached;
  }
  if (deadHosts.has(hostOf(url))) return null;

  const body = await perHost(url, async (): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) return null;

      // .gz sitemaps come back as raw bytes.
      if (url.endsWith('.gz')) {
        const buf = Buffer.from(await res.arrayBuffer());
        try {
          return (await gunzip(buf)).toString('utf-8');
        } catch {
          return buf.toString('utf-8');
        }
      }
      return await res.text();
    } catch (err) {
      // A thrown fetch means we never reached the host (DNS/refused/TLS), as
      // opposed to a 404, which is a live host telling us the path is wrong.
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? '';
      if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_TLS|CERT_/i.test(cause)) {
        deadHosts.add(hostOf(url));
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  });

  await writeCache(url, body ?? 'MISS');
  return body;
}

// ---------------------------------------------------------------------------
// Sitemap / feed discovery
//
// Crypto projects almost never keep writing on the apex domain. It lives on
// blog.<domain>, mirror.xyz, Medium or Substack -- none of which appear in
// the apex sitemap. Probing only <domain>/sitemap.xml yields ~nothing, so we
// hunt for the blog origin first and treat anything found there as editorial
// by definition (a post at blog.uniswap.org/foo has no "/blog/" in its path).
// ---------------------------------------------------------------------------

const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/blog/sitemap.xml',
  '/blog-sitemap.xml',
  '/post-sitemap.xml',
  '/sitemap/sitemap.xml',
];

/** Paths worth probing on a blog origin, sitemaps first then feeds. */
const BLOG_PROBE_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/rss.xml',
  '/rss',
  '/feed',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
];

/** Subdomains that commonly hold a project's writing. */
const BLOG_SUBDOMAINS = ['blog', 'research', 'mirror', 'writing', 'insights'];

interface BlogSource {
  url: string; // the sitemap/feed URL
  trusted: boolean; // true => every URL from it counts as editorial
}

const isXml = (s: string) => /^\s*<(\?xml|urlset|sitemapindex|rss|feed)/i.test(s);

/** Look on the homepage for a link pointing at the project's blog. */
async function blogLinkFromHomepage(origin: string): Promise<string | null> {
  const html = await fetchText(origin);
  if (!html) return null;
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = m[1];
    if (!/\b(blog|research|insights|newsroom)\b/i.test(raw)) continue;
    if (/\.(png|jpg|svg|css|js)$/i.test(raw)) continue;
    try {
      const abs = new URL(raw, origin);
      if (!/^https?:$/.test(abs.protocol)) continue;
      return abs.origin + abs.pathname.replace(/\/$/, '');
    } catch {
      /* ignore malformed href */
    }
  }
  return null;
}

/**
 * Where a project might publish, grouped into priority tiers.
 *
 * Tiers exist for speed. Probing all ~50 candidate URLs one at a time costs
 * minutes per app, most of it waiting on subdomains that don't exist. Instead
 * we fire each tier in parallel and stop at the first tier that yields URLs,
 * so a project whose blog sits at blog.<domain> costs one round trip rather
 * than forty.
 */
function blogSourceTiers(origin: string): BlogSource[][] {
  let host: string;
  try {
    host = new URL(origin).host.replace(/^www\./, '');
  } catch {
    return [];
  }

  const tier = (urls: string[], trusted: boolean): BlogSource[] =>
    [...new Set(urls)].map((url) => ({ url, trusted }));

  return [
    // 1. blog.<domain> -- by far the most common layout.
    tier(
      BLOG_SUBDOMAINS.flatMap((sub) =>
        BLOG_PROBE_PATHS.map((p) => `https://${sub}.${host}${p}`),
      ),
      true,
    ),
    // 2. A blog section on the apex domain.
    tier(
      ['/blog', '/research', '/learn', '/insights'].flatMap((section) =>
        ['/sitemap.xml', '/rss.xml', '/feed', '/atom.xml'].map(
          (p) => `https://${host}${section}${p}`,
        ),
      ),
      true,
    ),
    // 3. Whole-site sitemaps. Untrusted: they list product pages too, so the
    //    editorial path filter still has to apply.
    tier(
      COMMON_SITEMAP_PATHS.map((p) => `https://${host}${p}`),
      false,
    ),
  ];
}

/**
 * Scrape post links straight off a blog index page.
 *
 * Plenty of project blogs (blog.pancakeswap.finance, benqi.fi/blog, ...) are
 * Next.js apps that ship neither a sitemap nor an RSS feed, so every
 * structured probe misses even though the blog is right there. Reading the
 * index HTML and keeping the slug-shaped links recovers those.
 */
async function articleLinksFromIndex(indexUrl: string): Promise<UrlEntry[]> {
  const html = await fetchText(indexUrl);
  if (!html || isXml(html)) return [];

  let base: URL;
  try {
    base = new URL(indexUrl);
  } catch {
    return [];
  }

  const out = new Map<string, UrlEntry>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let abs: URL;
    try {
      abs = new URL(m[1], indexUrl);
    } catch {
      continue;
    }
    if (abs.host !== base.host) continue;

    const clean = abs.pathname.replace(/\/$/, '');
    const tail = clean.split('/').pop() ?? '';
    // Post slugs are long and hyphenated; nav links ("/about", "/docs") aren't.
    if (tail.length < 10 || !tail.includes('-')) continue;
    if (/\.(png|jpe?g|svg|gif|css|js|pdf|xml|ico|webp)$/i.test(tail)) continue;
    if (URL_BLOCKLIST.test(clean)) continue;
    // Don't wander off the blog into the marketing site.
    if (base.pathname.length > 1 && !clean.startsWith(base.pathname.replace(/\/$/, '')))
      continue;

    const url = abs.origin + clean;
    if (!out.has(url)) out.set(url, { url, dateHint: null });
  }
  return [...out.values()];
}

/** Index pages worth scraping once the sitemap/feed probes have all missed. */
function blogIndexUrls(origin: string): string[] {
  let host: string;
  try {
    host = new URL(origin).host.replace(/^www\./, '');
  } catch {
    return [];
  }
  return [
    `https://blog.${host}/`,
    `https://${host}/blog`,
    `https://${host}/research`,
    `https://${host}/learn`,
    `https://${host}/insights`,
    `https://${host}/news`,
  ];
}

/**
 * Feeds on third-party publishing platforms that the project itself links to.
 *
 * Many crypto teams never self-host a blog; they write on Medium, Mirror or
 * Substack. The obvious approach -- guess the handle from the slug -- does not
 * work: avantis.substack.com is a self-help newsletter, not the protocol, and
 * a Medium feed never names the project's domain so there is no way to catch
 * that from the feed alone.
 *
 * So we invert it. Read the project's own homepage and follow only the blog
 * platforms it actually links to. A squatter cannot make the real site link
 * to them, which makes this the one trustworthy signal available.
 */
async function externalFeedsFromSite(
  origin: string,
  extraPages: string[] = [],
): Promise<string[]> {
  // A link to the project's Medium often sits in the footer of a subpage, or
  // on an /about or /community page, rather than on the landing page. Checking
  // only the homepage misses those, so sweep a few likely pages too.
  const pages = [
    origin,
    `${origin}/blog`,
    `${origin}/about`,
    `${origin}/community`,
    `${origin}/resources`,
    ...extraPages,
  ];

  const htmls = (
    await Promise.all([...new Set(pages)].map((p) => fetchText(p)))
  ).filter((h): h is string => Boolean(h));
  if (!htmls.length) return [];
  const html = htmls.join('\n');

  const feeds = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], origin);
    } catch {
      continue;
    }
    const host = u.host.replace(/^www\./, '');
    const seg = u.pathname.split('/').filter(Boolean);

    // medium.com/@handle or medium.com/publication.
    // Medium reuses its own domain for navigation, so a bare first segment is
    // often a generic route ("/link", "/about", "/tag/...") rather than a
    // publication -- following those produces a feed for the wrong account.
    if (host === 'medium.com' && seg[0]) {
      const h = seg[0].replace(/^@/, '');
      const generic =
        /^(link|about|help|me|m|tag|topic|search|new-story|plans|membership|policy|privacy|terms|jobs|press|blog)$/i;
      if (h.length >= 3 && !generic.test(h)) {
        feeds.add(
          seg[0].startsWith('@')
            ? `https://medium.com/feed/@${h}`
            : `https://medium.com/feed/${h}`,
        );
      }
    }
    // <handle>.medium.com
    if (host.endsWith('.medium.com')) {
      feeds.add(`https://medium.com/feed/@${host.replace('.medium.com', '')}`);
    }
    // <handle>.substack.com
    if (host.endsWith('.substack.com')) {
      feeds.add(`https://${host}/feed`);
    }
    // mirror.xyz/<handle> or <handle>.mirror.xyz
    if (host === 'mirror.xyz' && seg[0]) {
      feeds.add(`https://mirror.xyz/${seg[0]}/feed/atom`);
    }
    if (host.endsWith('.mirror.xyz')) {
      feeds.add(`https://${host}/feed/atom`);
    }
  }
  return [...feeds];
}


/** Probe one tier in parallel; return the highest-priority source that hit. */
async function probeTier(
  sources: BlogSource[],
): Promise<{ src: BlogSource; urls: UrlEntry[] } | null> {
  const results = await Promise.all(
    sources.map(async (src) => ({
      src,
      urls: await collectSitemapUrls(src.url),
    })),
  );
  return results.find((r) => r.urls.length > 0) ?? null;
}


/**
 * A discovered page plus whatever publish date its source advertised.
 *
 * The date matters twice: it decides which posts we bother fetching (we only
 * want recent ones), and it survives as a fallback when the article page
 * itself carries no date meta -- which is common on RSS-driven blogs.
 */
interface UrlEntry {
  url: string;
  dateHint: string | null;
}

/** Sitemap <url> blocks, pairing each <loc> with its <lastmod>. */
function sitemapEntries(xml: string): UrlEntry[] {
  const out: UrlEntry[] = [];
  for (const block of xml.matchAll(/<url\b[\s\S]*?<\/url>/gi)) {
    const loc = block[0].match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const lastmod = block[0].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
    out.push({
      url: decodeEntities(loc.trim()),
      dateHint: lastmod ? normaliseDate(lastmod) : null,
    });
  }
  // <sitemapindex> children have <loc> without a wrapping <url>.
  if (!out.length) {
    for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      out.push({ url: decodeEntities(m[1].trim()), dateHint: null });
    }
  }
  return out;
}

/** RSS <item> / Atom <entry> blocks, pairing each link with its publish date. */
function feedEntries(xml: string): UrlEntry[] {
  const out: UrlEntry[] = [];
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ];
  for (const b of blocks) {
    const chunk = b[0];
    const link =
      chunk.match(/<link>\s*([^<\s]+)\s*<\/link>/i)?.[1] ??
      chunk.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ??
      chunk.match(/<guid[^>]*>\s*(https?:[^<\s]+)\s*<\/guid>/i)?.[1];
    if (!link) continue;
    const date =
      chunk.match(/<pubDate>\s*([^<]+?)\s*<\/pubDate>/i)?.[1] ??
      chunk.match(/<published>\s*([^<]+?)\s*<\/published>/i)?.[1] ??
      chunk.match(/<updated>\s*([^<]+?)\s*<\/updated>/i)?.[1] ??
      chunk.match(/<dc:date>\s*([^<]+?)\s*<\/dc:date>/i)?.[1];
    out.push({
      url: decodeEntities(link.trim()),
      dateHint: date ? normaliseDate(date) : null,
    });
  }
  return out;
}

/**
 * Collect page URLs from a sitemap or feed, following <sitemapindex> one level
 * deep. Prefers child sitemaps that look editorial so we don't pull 50k
 * product URLs.
 */
async function collectSitemapUrls(
  sitemapUrl: string,
  depth = 0,
): Promise<UrlEntry[]> {
  const xml = await fetchText(sitemapUrl);
  // SPA sites serve their HTML shell for missing files -- that's a miss, and
  // parsing it would produce garbage URLs.
  if (!xml || !isXml(xml)) return [];

  // RSS/Atom carries its own dates, so handle it before the sitemap path.
  if (/<rss\b|<feed\b/i.test(xml.slice(0, 1000))) {
    const entries = feedEntries(xml).filter((e) =>
      /^https?:\/\//i.test(e.url),
    );
    if (entries.length) return entries.slice(0, MAX_SITEMAP_URLS);
  }

  const isIndex = /<sitemapindex/i.test(xml);
  const entries = sitemapEntries(xml);

  if (!isIndex) return entries.slice(0, MAX_SITEMAP_URLS);
  if (depth >= 2) return [];

  // Editorial-looking child sitemaps first, then a couple of others.
  const editorialChildren = entries.filter((e) =>
    /(blog|post|article|news|research|learn|insight)/i.test(e.url),
  );
  const children = (
    editorialChildren.length ? editorialChildren : entries
  ).slice(0, 5);

  const out: UrlEntry[] = [];
  for (const child of children) {
    out.push(...(await collectSitemapUrls(child.url, depth + 1)));
    if (out.length >= MAX_SITEMAP_URLS) break;
  }
  return out.slice(0, MAX_SITEMAP_URLS);
}

// ---------------------------------------------------------------------------
// URL-level filtering (cheap, before we fetch any article)
// ---------------------------------------------------------------------------

const EDITORIAL_PATH =
  /\/(blog|posts?|articles?|research|learn|insights?|writing|news|academy|guides?|tutorials?|education|docs\/concepts)\//i;

/** Pages that are never educational, judged from the URL alone. */
const URL_BLOCKLIST =
  /\/(tag|tags|category|categories|author|authors|page|feed|rss|amp|search|archive|privacy|terms|legal|careers|jobs|press|brand|media-kit|changelog|releases?|status|login|signup)\b/i;

/**
 * `trusted` sources are blog origins (blog.foo.com, foo.com/blog/rss), where
 * every URL is a post and the "/blog/" path check would wrongly reject them.
 * Untrusted sources are whole-site sitemaps, where the path check is the only
 * thing separating posts from product pages.
 */
function looksEditorial(url: string, trusted: boolean): boolean {
  if (URL_BLOCKLIST.test(url)) return false;
  if (!trusted && !EDITORIAL_PATH.test(url)) return false;

  // Bare section indexes ("/blog/", "/") aren't articles.
  const clean = url.replace(/[?#].*$/, '').replace(/\/$/, '');
  const tail = clean.split('/').pop();
  if (!tail || tail.length <= 3 || /^\d+$/.test(tail)) return false;
  // A trusted origin's own root/section pages have no slug depth.
  if (trusted) {
    try {
      const p = new URL(clean).pathname.replace(/^\/|\/$/g, '');
      if (!p || !/[a-z]{4,}-|[a-z]{8,}/i.test(p)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Article extraction
// ---------------------------------------------------------------------------

const metaContent = (html: string, patterns: RegExp[]): string => {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return '';
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Strip scripts/styles/tags down to readable prose. */
function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function extractArticle(
  url: string,
  dateHint: string | null = null,
): Promise<ArticleCandidate | null> {
  const html = await fetchText(url);
  if (!html) return null;

  // The closing quote must match the opening one. Using [\"'] at both ends
  // stops at the first apostrophe inside the content, truncating any title
  // that contains one ("It's a trap" -> "It").
  const title =
    metaContent(html, [
      /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
      /<meta[^>]+property='og:title'[^>]+content='([^']+)'/i,
      /<meta[^>]+name="twitter:title"[^>]+content="([^"]+)"/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]) || '';

  const description = metaContent(html, [
    /<meta[^>]+name="description"[^>]+content="([^"]*)"/i,
    /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i,
    /<meta[^>]+name='description'[^>]+content='([^']*)'/i,
  ]);

  // Page meta first; fall back to the date the sitemap/feed advertised.
  const publishedAt =
    normaliseDate(
      metaContent(html, [
        /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:published_time["'][^>]+content=["']([^"']+)["']/i,
        /"datePublished"\s*:\s*"([^"]+)"/i,
        /<time[^>]+datetime=["']([^"']+)["']/i,
      ]),
    ) ?? dateHint;

  const text = textOf(html);
  const wordCount = text ? text.split(/\s+/).length : 0;

  return {
    url,
    title: title.replace(/\s+/g, ' ').slice(0, 200),
    description: description.slice(0, 400),
    publishedAt,
    wordCount,
    // Enough for a human/model to judge quality and write a TLDR without
    // opening the page.
    excerpt: text.slice(0, 1200),
    rejected: null,
  };
}

// ---------------------------------------------------------------------------
// Auto-reject rules -- kill the obvious non-education before human review
// ---------------------------------------------------------------------------

const ANNOUNCEMENT_TITLE =
  /\b(is (now )?live|now available|announcing|announcement|introducing our|partners? with|partnership|integrat(es|ion) with|listed on|listing|now supports|welcome|joins|raises|funding round|series [abc]\b|airdrop|giveaway|campaign|contest|ama\b|recap|monthly update|weekly update|newsletter|roadmap update|price prediction|how to buy|tokenomics update)\b/i;

function applyRejectRules(a: ArticleCandidate): ArticleCandidate {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MAX_AGE_MONTHS);

  let rejected: string | null = null;

  if (!a.title) rejected = 'no-title';
  else if (a.wordCount < MIN_WORDS) rejected = `too-short(${a.wordCount}w)`;
  else if (ANNOUNCEMENT_TITLE.test(a.title)) rejected = 'announcement-or-promo';
  else if (a.publishedAt && new Date(a.publishedAt) < cutoff)
    rejected = `stale(${a.publishedAt})`;

  return { ...a, rejected };
}

// ---------------------------------------------------------------------------
// Per-app pipeline
// ---------------------------------------------------------------------------

async function processApp(slug: string): Promise<AppResult> {
  const base: AppResult = {
    slug,
    name: slug,
    website: null,
    status: 'ok',
    sitemapsTried: [],
    candidates: [],
  };

  let meta: {
    name?: string;
    // twitter/github are used to guess handles on third-party blog platforms.
    links?: {
      website?: string;
      docs?: string;
      twitter?: string;
      github?: string;
    };
  };
  try {
    meta = JSON.parse(
      await fs.readFile(path.join(APPS_DIR, slug, 'meta.json'), 'utf-8'),
    );
  } catch {
    return { ...base, status: 'error', note: 'meta.json unreadable' };
  }

  base.name = meta.name ?? slug;

  const site = meta.links?.website ?? meta.links?.docs;
  if (!site) return { ...base, status: 'no-links' };

  let origin: string;
  try {
    origin = new URL(site).origin;
  } catch {
    return { ...base, status: 'error', note: `bad website url: ${site}` };
  }
  base.website = origin;

  // 1. Find where this project publishes, cheapest tier first.
  let urls: UrlEntry[] = [];
  let trusted = false;
  let hitSource = '';

  for (const tierSources of blogSourceTiers(origin)) {
    const hit = await probeTier(tierSources);
    if (hit) {
      urls = hit.urls;
      trusted = hit.src.trusted;
      hitSource = hit.src.url;
      break;
    }
  }

  // 2. Follow whatever the homepage calls its blog, in case it lives
  //    somewhere we'd never guess.
  if (!urls.length) {
    const discovered = await blogLinkFromHomepage(origin);
    if (discovered) {
      const hit = await probeTier(
        BLOG_PROBE_PATHS.map((p) => ({ url: `${discovered}${p}`, trusted: true })),
      );
      if (hit) {
        urls = hit.urls;
        trusted = true;
        hitSource = hit.src.url;
      }
      if (!urls.length) {
        const scraped = await articleLinksFromIndex(discovered);
        if (scraped.length) {
          urls = scraped;
          trusted = true;
          hitSource = `${discovered} (html)`;
        }
      }
    }
  }

  // 3. Last resort: scrape the blog index HTML directly. Catches JS-rendered
  //    blogs that publish no sitemap and no feed.
  if (!urls.length) {
    const scrapes = await Promise.all(
      blogIndexUrls(origin).map(async (u) => ({
        u,
        entries: await articleLinksFromIndex(u),
      })),
    );
    const hit = scrapes.find((s) => s.entries.length >= 3);
    if (hit) {
      urls = hit.entries;
      trusted = true;
      hitSource = `${hit.u} (html)`;
    }
  }

  // 4. The project may not self-host at all. Try the third-party platforms
  //    crypto teams actually publish on, guessing handles from the registry.
  if (!urls.length) {
    // Docs sites carry the same footer links and are worth sweeping too.
    const docsPage = meta.links?.docs ? [meta.links.docs] : [];
    for (const feedUrl of await externalFeedsFromSite(origin, docsPage)) {
      const found = await collectSitemapUrls(feedUrl);
      // Two entries is a real feed; one is usually a placeholder profile page.
      if (found.length < 2) continue;
      urls = found;
      trusted = true;
      hitSource = `${feedUrl} (external)`;
      break;
    }
  }

  base.sitemapsTried = hitSource ? [hitSource] : [];

  if (!urls.length) return { ...base, status: 'no-sitemap' };

  // 2. Keep only editorial-looking URLs, de-duplicated.
  const bySlug = new Map<string, UrlEntry>();
  for (const e of urls) {
    if (looksEditorial(e.url, trusted) && !bySlug.has(e.url)) bySlug.set(e.url, e);
  }
  const editorial = [...bySlug.values()];
  if (!editorial.length) return { ...base, status: 'no-editorial-urls' };

  // Newest first. Sitemap/feed ordering is not something we can assume -- some
  // list oldest-first, some newest-first -- so sort on the advertised date
  // where we have one and only fall back to source order when we don't.
  const dated = editorial.filter((e) => e.dateHint);
  const ordered = (
    dated.length >= Math.min(5, editorial.length)
      ? [...editorial].sort((a, b) =>
          (b.dateHint ?? '').localeCompare(a.dateHint ?? ''),
        )
      : editorial
  ).slice(0, MAX_ARTICLES_PER_APP);

  // 3. Extract + auto-reject.
  const candidates: ArticleCandidate[] = [];
  for (const entry of ordered) {
    const art = await extractArticle(entry.url, entry.dateHint);
    if (art) candidates.push(applyRejectRules(art));
  }

  candidates.sort((a, b) => {
    if (!!a.rejected !== !!b.rejected) return a.rejected ? 1 : -1;
    return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
  });

  return { ...base, candidates };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function resolveSlugs(): Promise<string[]> {
  const fromArg = arg('slugs');
  if (fromArg) return fromArg.split(',').map((s) => s.trim()).filter(Boolean);

  const fromFile = arg('file');
  if (fromFile) {
    const txt = await fs.readFile(path.resolve(fromFile), 'utf-8');
    return txt
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  if (flag('all')) return (await fs.readdir(APPS_DIR)).sort();

  throw new Error('Provide --slugs a,b / --file <path> / --all');
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  let slugs = await resolveSlugs();
  const limit = Number(arg('limit') ?? 0);
  if (limit > 0) slugs = slugs.slice(0, limit);

  const concurrency = Number(arg('concurrency') ?? 6);
  const outPath = path.resolve(arg('out') ?? DEFAULT_OUT);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  console.log(
    `Discovering resources for ${slugs.length} apps (concurrency ${concurrency})`,
  );

  const results: AppResult[] = [];
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < slugs.length) {
      const slug = slugs[cursor++];
      try {
        results.push(await processApp(slug));
      } catch (err) {
        results.push({
          slug,
          name: slug,
          website: null,
          status: 'error',
          note: String(err),
          sitemapsTried: [],
          candidates: [],
        });
      }
      done++;
      if (done % 10 === 0 || done === slugs.length) {
        console.log(`  ${done}/${slugs.length}`);
      }
      // Checkpoint: a long crawl that only writes at the end loses everything
      // if it's interrupted, and these runs take hours.
      if (done % 50 === 0) {
        await fs
          .writeFile(outPath, JSON.stringify(results, null, 2), 'utf-8')
          .catch(() => {});
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, slugs.length) }, worker),
  );

  results.sort((a, b) => a.slug.localeCompare(b.slug));

  const kept = results.filter((r) =>
    r.candidates.some((c) => !c.rejected),
  );

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf-8');

  // Summary -- the yield number is the thing worth knowing.
  const byStatus = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log('\n--- summary ---');
  for (const [k, v] of Object.entries(byStatus)) console.log(`${k}: ${v}`);
  console.log(
    `apps with >=1 surviving candidate: ${kept.length}/${results.length}`,
  );
  console.log(
    `surviving candidates total: ${results.reduce(
      (n, r) => n + r.candidates.filter((c) => !c.rejected).length,
      0,
    )}`,
  );
  console.log(`\nwrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
