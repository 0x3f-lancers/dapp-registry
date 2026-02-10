import path from "path";
import distill from "./distill";
import logger from "../lib/logger";

const appsDir = path.join(process.cwd(), "data", "apps");
const dataDir = path.join(process.cwd(), "data");

// Get command-line arguments (slugs to process)
const slugsToProcess = process.argv.slice(2);

async function main() {
  try {
    logger.info("Starting distillation process...");
    logger.info({ appsDir, dataDir }, "Working directories");
    logger.info(
      {
        CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME
          ? "✓ SET"
          : "✗ NOT SET",
        CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY
          ? "✓ SET"
          : "✗ NOT SET",
        CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
          ? "✓ SET"
          : "✗ NOT SET",
        HMAC_SECRET: process.env.HMAC_SECRET ? "✓ SET" : "✗ NOT SET",
      },
      "Environment variables status",
    );

    // Pass slugs to distill function
    await distill(
      appsDir,
      dataDir,
      slugsToProcess.length > 0 ? slugsToProcess : undefined,
    );

    logger.info("✓ Distillation completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "✗ Distillation failed with error");
    console.error("\n=== DISTILLATION ERROR ===");
    console.error(error);
    console.error("=========================\n");
    process.exit(1);
  }
}

main();
