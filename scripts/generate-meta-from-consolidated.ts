import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { metaJsonSchema } from "./../schema/metaJsonSchema";
import logger from "./../lib/logger";

// Define the schema for a single dApp object in your final_dapps.rewritten.json
const finalDappSchema = z.object({
  slug: z.string(),
  chains_from_pages: z.array(z.string()).optional(), // Not directly used
  name: z.string(),
  category: z.string(), // Now required and a single string
  tags: z.array(z.string()),
  chains: z.array(z.string()),
  shortDescription: z.string(),
  logoUrl: z.string(),
  pricing: z.string(),
  description: z.string().optional(), // Made optional
  metaDescription: z.string().optional(), // Made optional
  pageTitle: z.string().optional(), // Made optional
  websiteUrl: z.url().optional(), // Made optional
  xUrl: z.url().optional(), // Made optional
  alternatives: z.array(z.string()),
  relatedDapps: z.array(z.string()),
  subcategories: z.array(z.string()), // Added subcategories
});

// Define the schema for the entire final_dapps.rewritten.json file (an array of finalDappSchema)
const finalDappsRewrittenFileSchema = z.array(finalDappSchema);

type FinalDappEntry = z.infer<typeof finalDappSchema>;
type MetaJsonContent = z.infer<typeof metaJsonSchema>;

export async function generateMetaFilesFromConsolidated(
  sourceFilePath: string,
  targetAppsDirPath: string,
) {
  try {
    // 1. Read the aggregated JSON file
    const consolidatedContent = await fs.readFile(sourceFilePath, "utf-8");
    const dapps: FinalDappEntry[] = finalDappsRewrittenFileSchema.parse(
      JSON.parse(consolidatedContent),
    );

    logger.info(
      `Processing ${dapps.length} dApps from ${path.basename(sourceFilePath)}`,
    );

    // 2. Iterate through each dApp object
    for (const dapp of dapps) {
      const dappFolderPath = path.join(targetAppsDirPath, dapp.slug);
      await fs.mkdir(dappFolderPath, { recursive: true });

      const metaFilePath = path.join(dappFolderPath, "meta.json");

      // 3. Construct meta.json content based on mapping
      const metaContent: MetaJsonContent = {
        slug: dapp.slug,
        name: dapp.name,
        logoUrl: dapp.logoUrl,
        category: dapp.category, // Directly map category
        subcategory: dapp.subcategories, // Directly map subcategories
        chains: dapp.chains_from_pages! ?? "Ethereum",
        pricing: dapp.pricing,
        content: {
          short: dapp.shortDescription,
          description: dapp.description || "", // Provide fallback
          meta: dapp.metaDescription || "", // Provide fallback
          pageTitle: dapp.pageTitle || "", // Provide fallback
        },
        links: {
          ...(dapp.websiteUrl && { website: dapp.websiteUrl }),
          ...(dapp.xUrl && { twitter: dapp.xUrl }),
        },
        relations: {
          alternatives: dapp.alternatives,
          related: dapp.relatedDapps,
        },
      };

      // 4. Validate against metaJsonSchema
      metaJsonSchema.parse(metaContent);

      // 5. Write the meta.json file
      await fs.writeFile(
        metaFilePath,
        JSON.stringify(metaContent, null, 2),
        "utf-8",
      );
      logger.info(`Created ${metaFilePath}`);
    }

    logger.info("Finished generating individual dApp meta.json files.");
  } catch (error) {
    logger.error(
      { error, filePath: sourceFilePath },
      "Error generating dApp meta.json files from consolidated source.",
    );
    process.exit(1);
  }
}

// Example usage if run directly
if (require.main === module) {
  const sourceFile = path.resolve(process.cwd(), "final_dapps.rewritten.json"); // Project root
  const targetDir = path.resolve(process.cwd(), "src", "apps");
  generateMetaFilesFromConsolidated(sourceFile, targetDir);
}
