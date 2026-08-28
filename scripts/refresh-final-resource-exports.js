const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const APPS_DIR = path.join(ROOT, "src", "apps");
const DATA_DIR = path.join(ROOT, "data");

const FILES = [
  {
    file: "FINAL-FAMOUS-OG.json",
    list: "famous-og",
    description:
      "Well-known / original apps in the registry, with their curated educational resources.",
  },
  {
    file: "FINAL-XLSX-APPS.json",
    list: "xlsx-coverage-sheet",
    description:
      "Every /dapp/ app URL from the Search Console coverage sheet, with its curated educational resources.",
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function tryReadMeta(slug) {
  const metaPath = path.join(APPS_DIR, slug, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  return readJson(metaPath);
}

function pageUrlForSlug(slug) {
  return `https://lancers.technology/web3-explorer/dapp/${slug}`;
}

function normalizeResource(resource) {
  return {
    title: resource.title ?? "",
    tldr: resource.tldr ?? "",
    url: resource.url ?? "",
    source: resource.source ?? "",
    tag: resource.tag ?? null,
    publishedAt: resource.publishedAt ?? null,
    image: resource.image ?? null,
  };
}

function buildEntry(seedEntry) {
  const meta = tryReadMeta(seedEntry.slug);
  if (!meta) {
    return {
      ...seedEntry,
      resources: Array.isArray(seedEntry.resources) ? seedEntry.resources : [],
      resourceCount:
        typeof seedEntry.resourceCount === "number"
          ? seedEntry.resourceCount
          : Array.isArray(seedEntry.resources)
            ? seedEntry.resources.length
            : 0,
    };
  }

  const resources = Array.isArray(meta.resources)
    ? meta.resources.map(normalizeResource)
    : [];

  return {
    slug: meta.slug ?? seedEntry.slug,
    name: meta.name ?? seedEntry.name ?? seedEntry.slug,
    category: meta.category ?? seedEntry.category ?? "",
    subcategory: Array.isArray(meta.subcategory)
      ? meta.subcategory
      : Array.isArray(seedEntry.subcategory)
        ? seedEntry.subcategory
        : [],
    website:
      meta.links?.website ??
      meta.links?.github ??
      seedEntry.website ??
      "",
    pageUrl: seedEntry.pageUrl ?? pageUrlForSlug(seedEntry.slug),
    resourceCount: resources.length,
    resources,
  };
}

function summarize(apps, slugsNotInRegistry) {
  let resources = 0;
  let resourcesWithImage = 0;
  let resourcesWithTag = 0;
  let resourcesWithDate = 0;
  const domains = new Set();
  const appsWithoutResources = [];

  for (const app of apps) {
    const list = Array.isArray(app.resources) ? app.resources : [];
    if (list.length === 0 && !slugsNotInRegistry.includes(app.slug)) {
      appsWithoutResources.push(app.slug);
    }

    for (const resource of list) {
      resources += 1;
      if (resource.image) resourcesWithImage += 1;
      if (resource.tag) resourcesWithTag += 1;
      if (resource.publishedAt) resourcesWithDate += 1;

      try {
        domains.add(new URL(resource.url).hostname.replace(/^www\./, ""));
      } catch {
        // Ignore malformed URLs so the export can still be written.
      }
    }
  }

  return {
    totals: {
      apps: apps.length,
      resources,
      resourcesWithImage,
      resourcesWithTag,
      resourcesWithDate,
      distinctSourceDomains: domains.size,
      slugsNotInRegistry: slugsNotInRegistry.length,
      appsWithoutResources: appsWithoutResources.length,
    },
    appsWithoutResources,
  };
}

function refreshFile(config) {
  const filePath = path.join(DATA_DIR, config.file);
  const seed = readJson(filePath);
  const apps = seed.apps.map(buildEntry);
  const slugsNotInRegistry = apps
    .filter((app) => !tryReadMeta(app.slug))
    .map((app) => app.slug);
  const summary = summarize(apps, slugsNotInRegistry);

  const next = {
    generatedAt: "2026-08-28",
    list: config.list,
    description: config.description,
    totals: summary.totals,
    slugsNotInRegistry,
    appsWithoutResources: summary.appsWithoutResources,
    apps,
  };

  writeJson(filePath, next);
  return {
    file: config.file,
    apps: next.totals.apps,
    resources: next.totals.resources,
    slugsNotInRegistry: next.totals.slugsNotInRegistry,
    appsWithoutResources: next.totals.appsWithoutResources,
  };
}

for (const config of FILES) {
  const result = refreshFile(config);
  console.log(
    `${result.file}: apps=${result.apps} resources=${result.resources} missing=${result.slugsNotInRegistry} empty=${result.appsWithoutResources}`,
  );
}
