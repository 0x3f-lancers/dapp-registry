import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { appsMinSchema } from "../schema/appsMinSchema";
import { facetsIndexSchema } from "../schema/faucetIndexJson";
import { z } from "zod";

// Type definition for app entry (copied from distill.ts for now, ideally shared)
type AppEntry = z.infer<typeof appsMinSchema>[number];

// Object to track changes for incremental facet generation (copied from distill.ts for now, ideally shared)
interface ChangedApps {
  added: AppEntry[];
  updated: { oldApp: AppEntry; newApp: AppEntry }[];
  removed: AppEntry[];
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-") // Replace multiple - with single -
    .replace(/-+$/, ""); // Trim - from end of text
}

export async function generateFacets(
  dataDir: string,
  changedApps: ChangedApps,
) {
  const facetsIndexPath = resolve(dataDir, "facets.index.json");

  let currentFacets: z.infer<typeof facetsIndexSchema>;

  try {
    const existingContent = readFileSync(facetsIndexPath, "utf-8");
    const parsedFacets = JSON.parse(existingContent);
    const validationResult = facetsIndexSchema.safeParse(parsedFacets);

    if (validationResult.success) {
      currentFacets = validationResult.data;
      console.log(`Loaded existing facets.index.json for incremental update.`);
    } else {
      console.warn(
        `Existing facets.index.json is invalid or doesn't match schema. Regenerating from scratch.`,
        validationResult.error,
      );
      currentFacets = initializeEmptyFacets();
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("No existing facets.index.json found. Generating from scratch.");
      currentFacets = initializeEmptyFacets();
    } else {
      console.error(`Error reading or parsing facets.index.json:`, error);
      currentFacets = initializeEmptyFacets(); // Fallback to empty if unexpected error
    }
  }

  function initializeEmptyFacets(): z.infer<typeof facetsIndexSchema> {
    return {
      filterableOptions: {
        network: [],
        category: [],
        subcategory: [],
        tags: [],
      },
      buckets: {
        network: {},
        category: {},
        subcategory: {},
        tags: {},
      },
      stats: 0,
      counts: {
        apps: 0,
        networks: 0,
        categories: 0,
        subcategories: 0,
      },
      labels: {
        network: {},
        category: {},
        subcategory: {},
      },
      assets: { networkLogos: {} },
      taxonomy: {
        categories: [],
        subcategories: [],
        category_to_subcategories: {},
        subcategory_to_categories: {},
      },
    };
  }



  // Helper to update facet counts and index
  const updateFacets = (app: AppEntry, type: "add" | "remove") => {
    const change = type === "add" ? 1 : -1;
    // Update network (chains)
    for (const chain of app.chains) {
      const slug = slugify(chain);
      let option = currentFacets.filterableOptions.network.find((o) => o.label === chain);
      if (option) {
        option.stats += change;
      } else if (type === "add") {
        currentFacets.filterableOptions.network.push({ label: chain, slug, stats: 1 });
      }

      if (type === "add") {
        if (!currentFacets.buckets.network[slug]) {
          currentFacets.buckets.network[slug] = [];
        }
        if (!currentFacets.buckets.network[slug].includes(app.slug)) {
          currentFacets.buckets.network[slug].push(app.slug);
        }
      } else {
        if (currentFacets.buckets.network[slug]) {
          currentFacets.buckets.network[slug] = currentFacets.buckets.network[
            slug
          ].filter((s) => s !== app.slug);
        }
      }
    }

    // Update category
    const categoryItem = app.category; // category is now a single string
    const categorySlug = slugify(categoryItem);
    let categoryOption = currentFacets.filterableOptions.category.find(
      (o) => o.label === categoryItem,
    );
    if (categoryOption) {
      categoryOption.stats += change;
    } else if (type === "add") {
      currentFacets.filterableOptions.category.push({
        label: categoryItem,
        slug: categorySlug,
        stats: 1,
      });
    }

    if (type === "add") {
      if (!currentFacets.buckets.category[categorySlug]) {
        currentFacets.buckets.category[categorySlug] = [];
      }
      if (!currentFacets.buckets.category[categorySlug].includes(app.slug)) {
        currentFacets.buckets.category[categorySlug].push(app.slug);
      }
    } else {
      if (currentFacets.buckets.category[categorySlug]) {
        currentFacets.buckets.category[categorySlug] = currentFacets.buckets.category[
          categorySlug
        ].filter((s) => s !== app.slug);
      }
    }

    // Update subcategory
    for (const subcategoryItem of app.subcategory) {
      const subcategorySlug = slugify(subcategoryItem);
      let subcategoryOption = currentFacets.filterableOptions.subcategory.find(
        (o) => o.label === subcategoryItem,
      );
      if (subcategoryOption) {
        subcategoryOption.stats += change;
      } else if (type === "add") {
        currentFacets.filterableOptions.subcategory.push({ label: subcategoryItem, slug: subcategorySlug, stats: 1 });
      }

      if (type === "add") {
        if (!currentFacets.buckets.subcategory[subcategorySlug]) {
          currentFacets.buckets.subcategory[subcategorySlug] = [];
        }
        if (!currentFacets.buckets.subcategory[subcategorySlug].includes(app.slug)) {
          currentFacets.buckets.subcategory[subcategorySlug].push(app.slug);
        }
      } else {
        if (currentFacets.buckets.subcategory[subcategorySlug]) {
          currentFacets.buckets.subcategory[subcategorySlug] = currentFacets.buckets.subcategory[
            subcategorySlug
          ].filter((s) => s !== app.slug);
        }
      }
    }

    // Update tags
    for (const tag of app.tags) {
      const tagSlug = slugify(tag);
      let tagOption = currentFacets.filterableOptions.tags.find(
        (o) => o.label === tag,
      );
      if (tagOption) {
        tagOption.stats += change;
      } else if (type === "add") {
        currentFacets.filterableOptions.tags.push({ label: tag, slug: tagSlug, stats: 1 });
      }

      if (type === "add") {
        if (!currentFacets.buckets.tags[tagSlug]) {
          currentFacets.buckets.tags[tagSlug] = [];
        }
        if (!currentFacets.buckets.tags[tagSlug].includes(app.slug)) {
          currentFacets.buckets.tags[tagSlug].push(app.slug);
        }
      } else {
        if (currentFacets.buckets.tags[tagSlug]) {
          currentFacets.buckets.tags[tagSlug] = currentFacets.buckets.tags[
            tagSlug
          ].filter((s) => s !== app.slug);
        }
      }
    }

    // Placeholder for new facets: counts, buckets, assets, taxonomy, labels.
    // These will remain empty until specific population logic is defined based on dapp data.
    // They are included here to satisfy the schema.
  };

  // Process removed apps
  for (const app of changedApps.removed) {
    updateFacets(app, "remove");
  }

  // Process updated apps
  for (const { oldApp, newApp } of changedApps.updated) {
    // First, remove contributions from oldApp
    updateFacets(oldApp, "remove");
    // Then, add contributions from newApp
    updateFacets(newApp, "add");
  }

  // Process added apps
  for (const app of changedApps.added) {
    updateFacets(app, "add");
  }

  const allSlugsInBuckets = new Set<string>();
  for (const key of ["network", "category", "subcategory", "tags"] as const) {
    for (const slugList of Object.values(currentFacets.buckets[key])) {
      for (const appSlug of slugList) {
        allSlugsInBuckets.add(appSlug);
      }
    }
  }
  currentFacets.stats = allSlugsInBuckets.size;

  // Clean up and re-sort
  for (const key of ["network", "category", "subcategory", "tags"] as const) {
    // Remove options with stats <= 0
    currentFacets.filterableOptions[key] = currentFacets.filterableOptions[key].filter(
      (option) => option.stats > 0,
    );
    // Sort options by stats descending
    currentFacets.filterableOptions[key].sort((a, b) => b.stats - a.stats);

    // Remove empty buckets entries
    for (const slug in currentFacets.buckets[key]) {
      if (currentFacets.buckets[key][slug].length === 0) {
        delete (currentFacets.buckets[key] as any)[slug];
      }
    }
  }

  // Populate top-level counts
  currentFacets.counts = {
    apps: currentFacets.stats,
    networks: currentFacets.filterableOptions.network.length,
    categories: currentFacets.filterableOptions.category.length,
    subcategories: currentFacets.filterableOptions.subcategory.length,
  };

  // Populate top-level labels
  currentFacets.labels = {
    network: currentFacets.filterableOptions.network.reduce((acc, curr) => {
      acc[curr.slug] = curr.label;
      return acc;
    }, {} as Record<string, string>),
    category: currentFacets.filterableOptions.category.reduce((acc, curr) => {
      acc[curr.slug] = curr.label;
      return acc;
    }, {} as Record<string, string>),
    subcategory: currentFacets.filterableOptions.subcategory.reduce((acc, curr) => {
      acc[curr.slug] = curr.label;
      return acc;
    }, {} as Record<string, string>),
  };

  // Populate assets.networkLogos from chain_logos.json
  const chainLogosPath = resolve(dataDir, "chain_logos.json");
  try {
    const chainLogosContent = readFileSync(chainLogosPath, "utf-8");
    const parsedChainLogos = JSON.parse(chainLogosContent);
    if (parsedChainLogos && parsedChainLogos.name_to_url) {
      currentFacets.assets.networkLogos = parsedChainLogos.name_to_url;
    } else {
      console.warn(`Warning: ${chainLogosPath} does not contain a 'name_to_url' object. Assets.networkLogos will be empty.`);
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(`Warning: ${chainLogosPath} not found. Assets.networkLogos will be empty.`);
    } else {
      console.error(`Error reading or parsing ${chainLogosPath}:`, error);
    }
    currentFacets.assets.networkLogos = {}; // Ensure it's an empty object on error
  }

  // Populate taxonomy from taxonomy.json
  const taxonomyPath = resolve(dataDir, "taxonomy.json");
  try {
    const taxonomyContent = readFileSync(taxonomyPath, "utf-8");
    currentFacets.taxonomy = JSON.parse(taxonomyContent);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(`Warning: ${taxonomyPath} not found. Taxonomy will be empty.`);
    } else {
      console.error(`Error reading or parsing ${taxonomyPath}:`, error);
    }
    currentFacets.taxonomy = {
      categories: [],
      subcategories: [],
      category_to_subcategories: {},
      subcategory_to_categories: {},
    };
  }

  facetsIndexSchema.parse(currentFacets); // Validate against the schema

  writeFileSync(facetsIndexPath, JSON.stringify(currentFacets, null, 2), "utf-8");
  console.log(`Generated ${facetsIndexPath}`);
}

// Update the standalone execution block
if (require.main === module) {
  const defaultDataDir = resolve(__dirname, "../../data"); // Updated path
  const appsMinPath = resolve(defaultDataDir, "apps.min.json");
  let standaloneApps: AppEntry[] = [];

  try {
    const appsMinContent = readFileSync(appsMinPath, "utf-8");
    standaloneApps = appsMinSchema.parse(JSON.parse(appsMinContent));
  } catch (error) {
    console.error("Error reading or parsing apps.min.json for standalone facet generation:", error);
    process.exit(1);
  }

  // When run standalone, we don't have detailed 'changedApps'.
  // So, we'll simulate a full regeneration by treating all apps as 'added'.
  const simulatedChangedApps: ChangedApps = {
    added: standaloneApps,
    updated: [],
    removed: [],
  };
  generateFacets(defaultDataDir, simulatedChangedApps);
  // The counts.apps will be calculated by the generateFacets function now.
}
