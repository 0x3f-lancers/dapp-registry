import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { metaJsonSchema } from "../lib/schema";
import logger from "../lib/logger";
import fetch from "node-fetch";
import { URL } from "url";
import AbortController from "abort-controller";

const HTTP_TIMEOUT_MS = 5000;

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

      // Validate logoUrl: local file existence or hosted URL accessibility
      const { logoUrl } = meta;
      if (logoUrl.startsWith("./")) {
        // Local path
        const logoPath = path.join(appsDir, slug, logoUrl);
        try {
          await fs.access(logoPath);
        } catch (error) {
          logger.error(
            { metaPath, logoPath },
            "Local logo file does not exist.",
          );
          hasErrors = true;
        }
      } else if (
        logoUrl.startsWith("http://") ||
        logoUrl.startsWith("https://")
      ) {
        // Hosted URL with timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        try {
          const response = await fetch(logoUrl, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            logger.error(
              { metaPath, logoUrl, status: response.status },
              "Hosted logo URL is not accessible or returned an error status.",
            );
            hasErrors = true;
          }
        } catch (error) {
          clearTimeout(timeoutId);
          logger.error(
            { metaPath, logoUrl, error },
            "Failed to access hosted logo URL (network error or timeout).",
          );
          hasErrors = true;
        }
      } else {
        logger.error(
          { metaPath, logoUrl },
          "Logo URL is neither a local path nor a valid hosted URL.",
        );
        hasErrors = true;
      }

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
            "Relation does not exist in data/apps/.",
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
