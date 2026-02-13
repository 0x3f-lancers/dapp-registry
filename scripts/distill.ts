import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { metaJsonSchema } from "../schema/metaJsonSchema";
import { appsMinSchema } from "../schema/appsMinSchema";
import { uploadImage } from "../lib/cloudinary";
import dotenv from "dotenv";
import crypto from "crypto";
import logger from "../lib/logger";
import { generateFacets } from "../scripts/generate-facets";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

export default async function distill(
  appsDir: string = path.resolve(process.cwd(), "src", "apps"),
  dataDir: string,
  slugsToProcess?: string[],
) {
  await fs.mkdir(dataDir, { recursive: true });

  const appsMinPath = path.join(dataDir, "apps.min.json");

  let existingApps: z.infer<typeof appsMinSchema> = [];
  let initialExistingApps: z.infer<typeof appsMinSchema> = []; // To track removed apps
  try {
    const existingContent = await fs.readFile(appsMinPath, "utf-8");
    existingApps = JSON.parse(existingContent);
    initialExistingApps = JSON.parse(existingContent); // Copy for comparison
    logger.info(
      `Loaded existing apps.min.json with ${existingApps.length} apps`,
    );
  } catch {
    logger.info("No existing apps.min.json found, creating new one");
  }

  // Type definition for app entry
  type AppEntry = z.infer<typeof appsMinSchema>[number];

  // Object to track changes for incremental facet generation
  interface ChangedApps {
    added: AppEntry[];
    updated: { oldApp: AppEntry; newApp: AppEntry }[];
    removed: AppEntry[];
  }

  const changedApps: ChangedApps = {
    added: [],
    updated: [],
    removed: [],
  };

  const allDirSlugs = await fs.readdir(appsDir);
  const slugsForProcessing =
    slugsToProcess && slugsToProcess.length > 0 ? slugsToProcess : allDirSlugs;

  if (slugsToProcess && slugsToProcess.length > 0) {
    logger.info(`Processing only changed dapps: ${slugsToProcess.join(", ")}`);
  } else {
    logger.info("Processing all dapps (full rebuild).");
  }

  // Process only the changed/new slugs
  for (const slug of slugsForProcessing) {
    const metaPath = path.join(appsDir, slug, "meta.json");
    try {
      const fileContent = await fs.readFile(metaPath, "utf-8");
      const meta = metaJsonSchema.parse(JSON.parse(fileContent));

      let finalLogoUrl = meta.logoUrl;

      // Process image if not already on Cloudinary
      if (!meta.logoUrl.startsWith("https://res.cloudinary.com")) {
        const imageSourcePath = meta.logoUrl.startsWith("http")
          ? meta.logoUrl
          : path.join(appsDir, slug, meta.logoUrl);

        logger.info(`Processing image for ${meta.slug}: ${imageSourcePath}`);

        const uploadedUrl = await uploadImage(imageSourcePath, slug);

        if (uploadedUrl.startsWith("https://res.cloudinary.com")) {
          finalLogoUrl = uploadedUrl;

          if (finalLogoUrl !== meta.logoUrl) {
            const updatedMeta = { ...meta, logoUrl: finalLogoUrl };
            await fs.writeFile(
              metaPath,
              JSON.stringify(updatedMeta, null, 2),
              "utf-8",
            );
            logger.info(
              { slug: meta.slug, metaPath, finalLogoUrl },
              "✅ Updated meta.json with Cloudinary URL.",
            );
          }
        } else {
          logger.warn(
            { slug: meta.slug, originalLogoUrl: meta.logoUrl },
            "Cloudinary upload skipped or failed. Keeping original logoUrl.",
          );
          finalLogoUrl = meta.logoUrl;
        }
      } else {
        logger.info(
          { slug: meta.slug },
          "Already using Cloudinary URL, skipping upload",
        );
      }

      // Create the app entry
      const appEntry = {
        slug: meta.slug,
        name: meta.name,
        logoUrl: finalLogoUrl,
        category: meta.category,
        subcategory: meta.subcategory, // Added subcategory
        chains: meta.chains,
        tags: meta.tags,
        pricing: meta.pricing,
        short: meta.content.short,
        updatedAt: new Date().toISOString(),
      };

      // Update or add to existing apps
      const existingIndex = existingApps.findIndex((app) => app.slug === slug);
      if (existingIndex >= 0) {
        // App is updated
        const oldApp = existingApps[existingIndex]; // Capture old state
        existingApps[existingIndex] = appEntry;
        changedApps.updated.push({ oldApp, newApp: appEntry });
        logger.info({ slug }, "✅ Updated existing app in apps.min.json");
      } else {
        // App is new
        existingApps.push(appEntry);
        changedApps.added.push(appEntry);
        logger.info({ slug }, "✅ Added new app to apps.min.json");
      }
    } catch (error) {
      logger.error({ metaPath, error }, "Error processing meta.json.");
    }
  }

  // Filter out apps that no longer exist in the apps directory (only process existing meta.json files)
  const actualExistingSlugs = new Set(allDirSlugs);
  const appsAfterFiltering = existingApps.filter((app) =>
    actualExistingSlugs.has(app.slug),
  );

  // Identify removed apps by comparing initial apps with appsAfterFiltering
  const slugsAfterFiltering = new Set(
    appsAfterFiltering.map((app) => app.slug),
  );
  for (const initialApp of initialExistingApps) {
    if (!slugsAfterFiltering.has(initialApp.slug)) {
      changedApps.removed.push(initialApp);
    }
  }

  // Update existingApps to reflect only currently existing apps
  existingApps = appsAfterFiltering;

  // Write updated apps.min.json
  const appsMinJsonContent = JSON.stringify(existingApps, null, 2);
  await fs.writeFile(appsMinPath, appsMinJsonContent, "utf-8");
  logger.info(
    `Generated build/apps.min.json (${existingApps.length} total apps)`,
  );

  // Generate facets index
  await generateFacets(dataDir, changedApps);

  // HMAC signature generation and revalidation trigger
  const hmacSecret = process.env.HMAC_SECRET;
  const revalidateUrl = process.env.WEB3_EXPLORER_REVALIDATE_URL;

  if (!hmacSecret || hmacSecret === "super_secret_hmac_key") {
    logger.warn(
      "HMAC_SECRET is not set or is a placeholder. Skipping HMAC signature generation.",
    );
  } else if (!revalidateUrl) {
    logger.warn(
      "WEB3_EXPLORER_REVALIDATE_URL is not set. Skipping revalidation trigger.",
    );
  } else {
    // Create the payload - MUST match web3-explorer tag
    const payload = JSON.stringify({ tag: "dapps" });

    // Generate HMAC signature
    const hmac = crypto.createHmac("sha256", hmacSecret);
    hmac.update(payload);
    const signature = `sha256=${hmac.digest("hex")}`;

    logger.info(
      { signature },
      "Generated HMAC-SHA256 signature for revalidation request",
    );

    // Send revalidation request to web3-explorer
    try {
      const response = await fetch(revalidateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
        },
        body: payload,
      });

      if (response.ok) {
        const result = await response.json();
        logger.info(
          { status: response.status, result },
          "✅ Successfully triggered web3-explorer revalidation",
        );
      } else {
        const errorText = await response.text();
        logger.error(
          { status: response.status, error: errorText },
          "❌ Failed to trigger web3-explorer revalidation",
        );
      }
    } catch (error) {
      logger.error(
        { error },
        "❌ Network error while triggering web3-explorer revalidation",
      );
    }
  }

  logger.info("✅ Distillation complete.");
}
