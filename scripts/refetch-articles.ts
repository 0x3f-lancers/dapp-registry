/**
 * Re-fetch specific articles and extract their real body text.
 *
 * The discovery crawler keeps only a page's meta description plus a slice of
 * whatever text it could strip. On sites that render the whole chrome first
 * (or ship no description at all) that slice is navigation junk, which is not
 * enough to write an honest summary from. This does a more careful extraction:
 * find the element that actually holds the prose, then read from there.
 *
 * Usage:
 *   tsx scripts/refetch-articles.ts --in data/_weak-tldrs.json --out data/_article-bodies.json
 */

import { promises as fs } from 'fs';
import path from 'path';

const FETCH_TIMEOUT_MS = 20_000;
const PER_HOST_DELAY_MS = 500;
const USER_AGENT =
  'LancersDappRegistry/1.0 (+https://github.com/0x3f-lancers/dapp-registry) article-verification';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Target {
  slug: string;
  url: string;
  title: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&mdash;|&#8212;/g, '-')
    .replace(/&ndash;|&#8211;/g, '-')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Remove everything that is never article prose. */
function stripChrome(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');
}

const textOf = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

/**
 * Pull the prose out of a page.
 *
 * Strategy, in order of trustworthiness: an explicit <article>/<main> region,
 * then whichever container holds the most paragraph text, then as a last
 * resort every <p> on the page joined together.
 */
function extractBody(html: string): { text: string; strategy: string } {
  const cleaned = stripChrome(html);

  for (const [re, name] of [
    [/<article\b[^>]*>([\s\S]*?)<\/article>/i, 'article'],
    [/<main\b[^>]*>([\s\S]*?)<\/main>/i, 'main'],
    [
      /<div[^>]+(?:class|id)=["'][^"']*(?:post-content|entry-content|article-body|blog-content|prose|markdown)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      'content-div',
    ],
  ] as [RegExp, string][]) {
    const m = cleaned.match(re);
    if (m?.[1]) {
      const t = textOf(m[1]);
      if (t.length > 400) return { text: t, strategy: name };
    }
  }

  // Fall back to the paragraphs themselves -- navigation rarely lives in <p>.
  const paras = [...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => textOf(m[1]))
    .filter((t) => t.split(/\s+/).length >= 12);
  if (paras.length) {
    return { text: paras.join('\n'), strategy: `paragraphs(${paras.length})` };
  }

  return { text: textOf(cleaned), strategy: 'whole-page' };
}

const hostQueues = new Map<string, Promise<unknown>>();
function perHost<T>(url: string, fn: () => Promise<T>): Promise<T> {
  let host = 'x';
  try {
    host = new URL(url).host;
  } catch {
    /* keep default */
  }
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

async function fetchHtml(url: string): Promise<string | null> {
  return perHost(url, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
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
  });
}

async function main() {
  const inPath = path.resolve(arg('in') ?? 'data/_weak-tldrs.json');
  const outPath = path.resolve(arg('out') ?? 'data/_article-bodies.json');
  const targets: Target[] = JSON.parse(await fs.readFile(inPath, 'utf-8'));
  const chars = Number(arg('chars') ?? 2200);

  console.log(`Re-fetching ${targets.length} articles...`);

  const results: (Target & {
    ok: boolean;
    strategy: string;
    words: number;
    body: string;
  })[] = [];

  let done = 0;
  let cursor = 0;
  const concurrency = Number(arg('concurrency') ?? 8);

  async function worker() {
    while (cursor < targets.length) {
      const t = targets[cursor++];
      const html = await fetchHtml(t.url);
      if (!html) {
        results.push({ ...t, ok: false, strategy: 'fetch-failed', words: 0, body: '' });
      } else {
        const { text, strategy } = extractBody(html);
        results.push({
          ...t,
          ok: text.length > 300,
          strategy,
          words: text.split(/\s+/).length,
          body: text.slice(0, chars),
        });
      }
      done++;
      if (done % 10 === 0 || done === targets.length) {
        console.log(`  ${done}/${targets.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker),
  );

  results.sort((a, b) => a.slug.localeCompare(b.slug) || a.url.localeCompare(b.url));
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf-8');

  const failed = results.filter((r) => !r.ok);
  console.log(`\nusable bodies: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log('failed:');
    for (const f of failed) console.log(`  - ${f.slug} ${f.strategy} ${f.url}`);
  }
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
