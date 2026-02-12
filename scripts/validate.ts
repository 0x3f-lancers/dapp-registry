import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { metaJsonSchema } from "../schema/metaJsonSchema";
import logger from "../lib/logger";

export default async function validate(appsDir: string) {
  let hasErrors = false;
  let allSlugs: string[] = [];

  try {
    allSlugs = await fs.readdir(appsDir);
  } catch (error) {
    logger.error(
      { error },
      `Could not read ${appsDir}. Ensure the directory exists.`,
    );
    throw error;
  }

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

      // Validate relations
      const { alternatives, related } = meta.relations;
      for (const relation of [...alternatives, ...related]) {
        if (!allSlugs.includes(relation)) {
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
