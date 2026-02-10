import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import { appsMinSchema } from "../schema/appsMinSchema";
import { facetsIndexSchema, FacetsIndex } from "../schema/faucetIndexJson";

type AppMin = z.infer<typeof appsMinSchema>[number];

// In-memory cache
let appsCache: AppMin[] | null = null;
let facetsCache: FacetsIndex | null = null;

function union(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

function setForGroup(
  selected: string[],
  groupIndex: Record<string, string[]>,
  allSlugs: Set<string>,
): Set<string> {
  if (!selected.length) return allSlugs;
  const sets = selected.map((slug) => new Set(groupIndex[slug] ?? []));
  return union(sets);
}

export interface SelectedFilters {
  network?: string[];
  category?: string[];
  subcategory?: string[];
}

function getAppsMin(): AppMin[] {
  if (appsCache) return appsCache;
  const appsMinPath = resolve(process.cwd(), "data", "apps.min.json");
  const content = readFileSync(appsMinPath, "utf-8");
  appsCache = appsMinSchema.parse(JSON.parse(content));
  return appsCache;
}

function getFacets(): FacetsIndex {
  if (facetsCache) return facetsCache;
  const facetsIndexPath = resolve(process.cwd(), "data", "facets.index.json");
  const content = readFileSync(facetsIndexPath, "utf-8");
  facetsCache = facetsIndexSchema.parse(JSON.parse(content));
  return facetsCache;
}

// Clear cache (call after data updates)
export function clearCache(): void {
  appsCache = null;
  facetsCache = null;
}

export function filterApps(selected: SelectedFilters): AppMin[] {
  const apps = getAppsMin();
  const facets = getFacets();
  const allSlugs = new Set(apps.map((a) => a.slug));

  const n = setForGroup(selected.network || [], facets.index.network, allSlugs);
  const c = setForGroup(
    selected.category || [],
    facets.index.category,
    allSlugs,
  );
  const s = setForGroup(
    selected.subcategory || [],
    facets.index.subcategory,
    allSlugs,
  );

  const allowed = intersect(intersect(n, c), s);
  return apps.filter((a) => allowed.has(a.slug));
}
