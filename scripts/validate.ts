import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { metaJsonSchema } from "../schema/metaJsonSchema";
import { taxonomySchema } from "../schema/taxonomySchema";
import { chainsSchema } from "../schema/chainsSchema";
import logger from "../lib/logger";

async function loadRegistries() {
  const taxonomyPath = path.resolve(process.cwd(), "data", "taxonomy.json");
  const chainsPath = path.resolve(process.cwd(), "data", "chains.json");

  const [taxonomyContent, chainsContent] = await Promise.all([
    fs.readFile(taxonomyPath, "utf-8"),
    fs.readFile(chainsPath, "utf-8"),
  ]);

  const taxonomy = taxonomySchema.parse(JSON.parse(taxonomyContent));
  const chains = chainsSchema.parse(JSON.parse(chainsContent));

  return {
    categories: new Set(taxonomy.categories),
    subcategories: new Set(taxonomy.subcategories),
    categoryToSubcategories: new Map(
      Object.entries(taxonomy.category_to_subcategories).map(
        ([category, subcategories]) => [category, new Set(subcategories)],
      ),
    ),
    chainNames: new Set(chains.chains.map((chain) => chain.name)),
  };
}

export default async function validate(appsDir: string) {
  let hasErrors = false;
  let allSlugs: string[] = [];
  let registries: Awaited<ReturnType<typeof loadRegistries>>;

  try {
    allSlugs = await fs.readdir(appsDir);
  } catch (error) {
    logger.error(
      { error },
      `Could not read ${appsDir}. Ensure the directory exists.`,
    );
    throw error;
  }

  try {
    registries = await loadRegistries();
  } catch (error) {
    logger.error(
      { error },
      "Could not load taxonomy or chain registry data.",
    );
    throw error;
  }

  const slugSet = new Set(allSlugs);

  for (const slug of allSlugs) {
    const metaPath = path.join(appsDir, slug, "meta.json");
    try {
      const fileContent = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(fileContent);

      // Validate against Zod schema
      metaJsonSchema.parse(meta);

      // Validate slug against folder name
      if (meta.slug !== slug) {
        logger.error(
          { metaPath, expectedSlug: slug, actualSlug: meta.slug },
          "Slug does not match folder name.",
        );
        hasErrors = true;
      }

      if (!registries.categories.has(meta.category)) {
        logger.error(
          { metaPath, category: meta.category },
          "Category does not exist in taxonomy registry.",
        );
        hasErrors = true;
      }

      const allowedSubcategories = registries.categoryToSubcategories.get(
        meta.category,
      );
      for (const subcategory of meta.subcategory) {
        if (!registries.subcategories.has(subcategory)) {
          logger.error(
            { metaPath, category: meta.category, subcategory },
            "Subcategory does not exist in taxonomy registry.",
          );
          hasErrors = true;
          continue;
        }

        if (allowedSubcategories && !allowedSubcategories.has(subcategory)) {
          logger.error(
            { metaPath, category: meta.category, subcategory },
            "Subcategory is not allowed for category.",
          );
          hasErrors = true;
        }
      }

      for (const chain of meta.chains) {
        if (!registries.chainNames.has(chain)) {
          logger.error(
            { metaPath, chain },
            "Chain does not exist in chain registry.",
          );
          hasErrors = true;
        }
      }

      // Validate relations
      const { alternatives, related } = meta.relations;
      for (const relation of [...alternatives, ...related]) {
        if (!slugSet.has(relation)) {
          logger.error(
            { metaPath, relation },
            "Relation does not exist in src/apps/.",
          );
          hasErrors = true;
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error(
          { metaPath, issues: error.issues },
          "Zod validation failed.",
        );
      } else {
        logger.error(
          { metaPath, error },
          "Error reading or parsing meta.json.",
        );
      }
      hasErrors = true;
    }
  }

  if (hasErrors) {
    logger.error("Validation failed. Please fix the errors above.");
    throw new Error("Validation failed");
  } else {
    logger.info("Validation successful.");
  }
}
