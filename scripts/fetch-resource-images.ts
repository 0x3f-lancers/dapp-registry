/**
 * Find a share image for every published resource.
 *
 * Articles usually declare one via og:image for social previews. Where a page
 * has none, the card falls back to a local placeholder, so the output here
 * records only what genuinely exists rather than guessing a URL.
 *
 * Usage: tsx scripts/fetch-resource-images.ts [--out data/_resource-images.json]
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const APPS_DIR = path.resolve(process.cwd(), 'src', 'apps');
const CACHE_DIR = path.resolve(process.cwd(), 'data', '.resource-cache');
// A self-identifying agent gets a 403 from Medium, Alchemy, Moralis and every
// other Cloudflare-fronted host, which is where a third of our resources live.
// The og:image tag we want is the one those sites hand to Twitter and Slack
// unprompted, so asking for it as a browser is reading what they already
// publish, not circumventing anything.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15_000;
const DELAY_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const cacheKey = (url: string) =>
  crypto.createHash('sha1').update(url).digest('hex') + '.txt';

async function fetchHtml(url: string): Promise<string | null> {
  const cachePath = path.join(CACHE_DIR, cacheKey(url));
  try {
    const hit = await fs.readFile(cachePath, 'utf-8');
    if (hit && hit !== 'MISS') return hit;
    if (hit === 'MISS') return null;
  } catch {
    /* not cached yet */
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cachePath, html, 'utf-8').catch(() => {});
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    await sleep(DELAY_MS);
  }
}

/** Pull the share image, resolved to an absolute https URL. */
function imageFrom(html: string, pageUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property="og:image:secure_url"[^>]+content="([^"]+)"/i,
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
    /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i,
    /<meta[^>]+name="twitter:image:src"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i,
  ];
  for (const re of patterns) {
    const raw = html.match(re)?.[1]?.trim();
    if (!raw) continue;
    try {
      const abs = new URL(raw.replace(/&amp;/g, '&'), pageUrl);
      // Must be https: the consuming site is https, and next/image only has
      // https hosts allowlisted.
      if (abs.protocol !== 'https:') continue;
      // Some sites ship a build-time og:image pointing at their own dev
      // server (wormhole.com publishes http://localhost:3000/share.webp).
      // Those are unreachable for everyone but that developer.
      if (
        !abs.hostname.includes('.') ||
        /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
          abs.hostname,
        )
      ) {
        continue;
      }
      // Preview deployments rot. graphql.org serves its og:image from a
      // per-build Vercel URL (graphql-github-<hash>-...vercel.app) that dies
      // with the deployment, so the card would silently lose its artwork.
      if (
        /\.(vercel\.app|netlify\.app|pages\.dev|herokuapp\.com|onrender\.com|webflow\.io)$/i.test(
          abs.hostname,
        )
      ) {
        continue;
      }
      // Tracking pixels and spacers are not usable artwork.
      //
      // A site's own logo is the common case, not an edge one: a CMS with no
      // featured image on a post falls back to the site-wide default, so every
      // article on that blog reports the same logo as its og:image. tellor.io
      // hands out /wp-content/uploads/2024/11/logo512.png for every post. The
      // extension does not matter, so this is not limited to SVG.
      if (/(^|[/_-])(logo|icon|favicon|apple-touch|placeholder|default)[0-9x_-]*\.(svg|png|jpe?g|webp|gif)$/i.test(
          abs.pathname,
        )) {
        continue;
      }
      return abs.toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  const outPath = path.resolve(arg('out') ?? 'data/_resource-images.json');

  const targets: { slug: string; url: string }[] = [];
  for (const slug of await fs.readdir(APPS_DIR)) {
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(APPS_DIR, slug, 'meta.json'), 'utf-8'),
      );
      for (const r of meta.resources ?? []) targets.push({ slug, url: r.url });
    } catch {
      /* skip unreadable */
    }
  }

  console.log(`checking ${targets.length} resources for a share image...`);

  const images: Record<string, string> = {};
  const missing: { slug: string; url: string }[] = [];
  let cursor = 0;
  let done = 0;
  const concurrency = Number(arg('concurrency') ?? 10);

  async function worker() {
    while (cursor < targets.length) {
      const t = targets[cursor++];
      const html = await fetchHtml(t.url);
      const img = html ? imageFrom(html, t.url) : null;
      if (img) images[t.url] = img;
      else missing.push(t);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${targets.length}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker),
  );

  await fs.writeFile(
    outPath,
    JSON.stringify({ images, missing }, null, 2),
    'utf-8',
  );

  console.log(`\nwith image:    ${Object.keys(images).length}`);
  console.log(`without image: ${missing.length}`);
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
