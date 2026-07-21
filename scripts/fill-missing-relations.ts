import { promises as fs } from "fs";
import path from "path";

type MetaJson = {
  slug: string;
  name: string;
  category: string;
  subcategory: string[];
  chains: string[];
  tags?: string[];
  archived?: boolean;
  relations: {
    alternatives: string[];
    related: string[];
  };
};

type AppRecord = {
  dirName: string;
  metaPath: string;
  meta: MetaJson;
};

type Suggestion = {
  slug: string;
  score: number;
};

const DEFAULT_LIMIT = 3;

function toSet(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

function intersectionSize<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const value of a) {
    if (b.has(value)) {
      count += 1;
    }
  }
  return count;
}

function normalizeTags(tags: string[] | undefined, subcategories: string[]): Set<string> {
  const subcategorySet = new Set(subcategories);
  return new Set(
    (tags ?? [])
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && !subcategorySet.has(tag)),
  );
}

function compareSuggestions(a: Suggestion, b: Suggestion): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return a.slug.localeCompare(b.slug);
}

export function suggestAlternatives(
  target: MetaJson,
  apps: MetaJson[],
  limit = DEFAULT_LIMIT,
): string[] {
  const targetSubcategories = toSet(target.subcategory);
  const targetChains = toSet(target.chains);
  const targetTags = normalizeTags(target.tags, target.subcategory);

  return apps
    .filter((candidate) => {
      if (candidate.slug === target.slug || candidate.archived) {
        return false;
      }
      if (candidate.category !== target.category) {
        return false;
      }
      const sharedChains = intersectionSize(targetChains, toSet(candidate.chains));
      if (sharedChains === 0) {
        return false;
      }
      const sharedSubcategories = intersectionSize(
        targetSubcategories,
        toSet(candidate.subcategory),
      );
      return sharedSubcategories > 0;
    })
    .map((candidate) => {
      const candidateSubcategories = toSet(candidate.subcategory);
      const candidateChains = toSet(candidate.chains);
      const candidateTags = normalizeTags(candidate.tags, candidate.subcategory);

      const sharedSubcategories = intersectionSize(
        targetSubcategories,
        candidateSubcategories,
      );
      const sharedChains = intersectionSize(targetChains, candidateChains);
      const sharedTags = intersectionSize(targetTags, candidateTags);
      const exactSubcategoryMatch =
        targetSubcategories.size === candidateSubcategories.size &&
        sharedSubcategories === targetSubcategories.size;

      const score =
        sharedSubcategories * 100 +
        (exactSubcategoryMatch ? 25 : 0) +
        sharedChains * 20 +
        sharedTags * 5;

      return { slug: candidate.slug, score };
    })
    .sort(compareSuggestions)
    .slice(0, limit)
    .map((candidate) => candidate.slug);
}

export function suggestRelated(
  target: MetaJson,
  apps: MetaJson[],
  alternatives: string[],
  limit = DEFAULT_LIMIT,
): string[] {
  const targetSubcategories = toSet(target.subcategory);
  const targetChains = toSet(target.chains);
  const targetTags = normalizeTags(target.tags, target.subcategory);
  const alternativeSet = new Set(alternatives);

  return apps
    .filter((candidate) => {
      if (
        candidate.slug === target.slug ||
        candidate.archived ||
        alternativeSet.has(candidate.slug)
      ) {
        return false;
      }

      const candidateSubcategories = toSet(candidate.subcategory);
      const candidateChains = toSet(candidate.chains);
      const candidateTags = normalizeTags(candidate.tags, candidate.subcategory);

      const sharedSubcategories = intersectionSize(
        targetSubcategories,
        candidateSubcategories,
      );
      const sharedChains = intersectionSize(targetChains, candidateChains);
      const sharedTags = intersectionSize(targetTags, candidateTags);
      const sameCategory = candidate.category === target.category;

      return (
        sharedChains > 0 &&
        (sameCategory || sharedSubcategories > 0 || sharedTags > 0)
      );
    })
    .map((candidate) => {
      const candidateSubcategories = toSet(candidate.subcategory);
      const candidateChains = toSet(candidate.chains);
      const candidateTags = normalizeTags(candidate.tags, candidate.subcategory);

      const sharedSubcategories = intersectionSize(
        targetSubcategories,
        candidateSubcategories,
      );
      const sharedChains = intersectionSize(targetChains, candidateChains);
      const sharedTags = intersectionSize(targetTags, candidateTags);
      const sameCategory = candidate.category === target.category ? 1 : 0;

      const score =
        sharedSubcategories * 60 +
        sameCategory * 25 +
        sharedChains * 20 +
        sharedTags * 5;

      return { slug: candidate.slug, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(compareSuggestions)
    .slice(0, limit)
    .map((candidate) => candidate.slug);
}

async function loadApps(appsDir: string): Promise<AppRecord[]> {
  const dirEntries = await fs.readdir(appsDir, { withFileTypes: true });
  const appDirs = dirEntries.filter((entry) => entry.isDirectory());

  return Promise.all(
    appDirs.map(async (entry) => {
      const metaPath = path.join(appsDir, entry.name, "meta.json");
      const fileContent = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(fileContent) as MetaJson;
      return {
        dirName: entry.name,
        metaPath,
        meta,
      };
    }),
  );
}

async function writeMeta(metaPath: string, meta: MetaJson) {
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const checkOnly = args.has("--check");
  const chainArg = rawArgs.find((arg) => arg.startsWith("--chain="));
  const chainFilter = chainArg ? chainArg.slice("--chain=".length).trim() : "";
  const appsDir = path.join(process.cwd(), "src", "apps");
  const allAppRecords = await loadApps(appsDir);
  const appRecords =
    chainFilter.length > 0
      ? allAppRecords.filter((record) => record.meta.chains.includes(chainFilter))
      : allAppRecords;
  const metas = appRecords.map((record) => record.meta);

  let missingFillCount = 0;

  for (const record of appRecords) {
    const meta = record.meta;
    const nextAlternatives =
      meta.relations.alternatives.length === 0
        ? suggestAlternatives(meta, metas)
        : meta.relations.alternatives;
    const nextRelated =
      meta.relations.related.length === 0
        ? suggestRelated(meta, metas, nextAlternatives)
        : meta.relations.related;

    const missingAlternatives =
      meta.relations.alternatives.length === 0 && nextAlternatives.length > 0;
    const missingRelated =
      meta.relations.related.length === 0 && nextRelated.length > 0;

    if (!missingAlternatives && !missingRelated) {
      continue;
    }

    missingFillCount += 1;

    const details = [
      missingAlternatives
        ? `alternatives=[${nextAlternatives.join(", ")}]`
        : null,
      missingRelated ? `related=[${nextRelated.join(", ")}]` : null,
    ]
      .filter(Boolean)
      .join(" ");

    console.log(`${record.dirName}: ${details}`);

    if (!checkOnly) {
      const updatedMeta: MetaJson = {
        ...meta,
        relations: {
          alternatives: missingAlternatives
            ? nextAlternatives
            : meta.relations.alternatives,
          related: missingRelated ? nextRelated : meta.relations.related,
        },
      };
      await writeMeta(record.metaPath, updatedMeta);
    }
  }

  if (missingFillCount === 0) {
    console.log("No missing fillable relations found.");
    return;
  }

  if (checkOnly) {
    console.error(
      `Found ${missingFillCount} app(s) with empty relations that can be backfilled.`,
    );
    process.exit(1);
  }

  console.log(`Updated ${missingFillCount} app(s) with suggested relations.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
