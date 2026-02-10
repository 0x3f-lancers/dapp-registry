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

  let currentFacets: z.infer<typeof facetsIndexSchema> = {
    options: {
      network: [],
      category: [],
      subcategory: [],
    },
    index: {
      network: {},
      category: {},
      subcategory: {},
    },
  };

  try {
    const existingContent = readFileSync(facetsIndexPath, "utf-8");
    currentFacets = facetsIndexSchema.parse(JSON.parse(existingContent));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("No existing facets.index.json found, creating new one.");
    } else {
      console.error(
        "Error reading or parsing existing facets.index.json:",
        error,
      );
    }
  }

  // Helper to update facet counts and index
  const updateFacets = (app: AppEntry, type: "add" | "remove") => {
    const change = type === "add" ? 1 : -1;

    // Update network (chains)
    for (const chain of app.chains) {
      const slug = slugify(chain);
      let option = currentFacets.options.network.find((o) => o.label === chain);
      if (option) {
        option.count += change;
      } else if (type === "add") {
        currentFacets.options.network.push({ label: chain, slug, count: 1 });
      }

      if (type === "add") {
        if (!currentFacets.index.network[slug]) {
          currentFacets.index.network[slug] = [];
        }
        if (!currentFacets.index.network[slug].includes(app.slug)) {
          currentFacets.index.network[slug].push(app.slug);
        }
      } else {
        if (currentFacets.index.network[slug]) {
          currentFacets.index.network[slug] = currentFacets.index.network[
            slug
          ].filter((s) => s !== app.slug);
        }
      }
    }

    // Update category
    for (const categoryItem of app.category) { // Iterate over the array
      const categorySlug = slugify(categoryItem);
      let categoryOption = currentFacets.options.category.find(
        (o) => o.label === categoryItem,
      );
      if (categoryOption) {
        categoryOption.count += change;
      } else if (type === "add") {
        currentFacets.options.category.push({
          label: categoryItem,
          slug: categorySlug,
          count: 1,
        });
      }

      if (type === "add") {
        if (!currentFacets.index.category[categorySlug]) {
          currentFacets.index.category[categorySlug] = [];
        }
        if (!currentFacets.index.category[categorySlug].includes(app.slug)) {
          currentFacets.index.category[categorySlug].push(app.slug);
        }
      } else {
        if (currentFacets.index.category[categorySlug]) {
          currentFacets.index.category[categorySlug] = currentFacets.index.category[
            categorySlug
          ].filter((s) => s !== app.slug);
        }
      }
    }

    // Update subcategory (tags)
    for (const tag of app.tags) {
      const slug = slugify(tag);
      let tagOption = currentFacets.options.subcategory.find(
        (o) => o.label === tag,
      );
      if (tagOption) {
        tagOption.count += change;
      } else if (type === "add") {
        currentFacets.options.subcategory.push({ label: tag, slug, count: 1 });
      }

      if (type === "add") {
        if (!currentFacets.index.subcategory[slug]) {
          currentFacets.index.subcategory[slug] = [];
        }
        if (!currentFacets.index.subcategory[slug].includes(app.slug)) {
          currentFacets.index.subcategory[slug].push(app.slug);
        }
      } else {
        if (currentFacets.index.subcategory[slug]) {
          currentFacets.index.subcategory[slug] = currentFacets.index.subcategory[
            slug
          ].filter((s) => s !== app.slug);
        }
      }
    }
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

  // Clean up and re-sort
  for (const key of ["network", "category", "subcategory"] as const) {
    // Remove options with count <= 0
    currentFacets.options[key] = currentFacets.options[key].filter(
      (option) => option.count > 0,
    );
    // Sort options by count descending
    currentFacets.options[key].sort((a, b) => b.count - a.count);

    // Remove empty index entries
    for (const slug in currentFacets.index[key]) {
      if (currentFacets.index[key][slug].length === 0) {
        delete currentFacets.index[key][slug];
      }
    }
  }

  facetsIndexSchema.parse(currentFacets); // Validate against the schema

  writeFileSync(facetsIndexPath, JSON.stringify(currentFacets, null, 2), "utf-8");
  console.log(`Generated ${facetsIndexPath}`);
}

// Update the standalone execution block
if (require.main === module) {
  const defaultDataDir = resolve(__dirname, "../data");
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
}
