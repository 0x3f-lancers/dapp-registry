import { promises as fs } from "fs";
import path from "path";
import { metaJsonSchema } from "../lib/schema";
import logger from "../lib/logger";
import fetch, { Response } from "node-fetch";
import { z } from "zod";

const SOCIAL_MEDIA_REDIRECT_HEURISTICS = [
  {
    domain: "twitter.com",
    genericPaths: ["/", "/home"],
    isGenericRedirect: (originalUrlObj: URL, finalUrlObj: URL) => {
      return (
        originalUrlObj.pathname !== "/" &&
        originalUrlObj.pathname.length > 1 &&
        (SOCIAL_MEDIA_REDIRECT_HEURISTICS[0].genericPaths.includes(
          finalUrlObj.pathname,
        ) ||
          finalUrlObj.pathname.startsWith("/search"))
      );
    },
  },
];

const APPS_DIR = path.join(process.cwd(), "data", "apps");

function extractUrls(meta: z.infer<typeof metaJsonSchema>): string[] {
  const urls: string[] = [];

  if (meta.logoUrl.startsWith("http")) {
    urls.push(meta.logoUrl);
  }

  for (const key in meta.links) {
    const url = meta.links[key as keyof typeof meta.links];
    if (url && typeof url === "string" && url.startsWith("http")) {
      urls.push(url);
    }
  }
  return urls;
}

async function checkLink(url: string): Promise<{
  url: string;
  status: "accessible" | "inaccessible";
  statusCode?: number;
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const originalUrlObj = new URL(url);
      const finalUrlObj = new URL(response.url);

      const heuristic = SOCIAL_MEDIA_REDIRECT_HEURISTICS.find((h) =>
        originalUrlObj.hostname.includes(h.domain),
      );

      if (heuristic) {
        const isRedirect = heuristic.isGenericRedirect(
          originalUrlObj,
          finalUrlObj,
        );
        if (isRedirect) {
          return {
            url,
            status: "inaccessible",
            statusCode: response.status,
            error: `${heuristic.domain} link redirected to generic page, profile/content likely does not exist.`,
          };
        }
      }
      return { url, status: "accessible", statusCode: response.status };
    } else {
      return {
        url,
        status: "inaccessible",
        statusCode: response.status,
        error: response.statusText,
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return {
        url,
        status: "inaccessible",
        error: `Timeout of 5000ms exceeded for ${url}.`,
      };
    }
    return { url, status: "inaccessible", error: error.message };
  }
}

export default async function checkLinksScript(
  appsDir: string = APPS_DIR,
  slugsToProcess?: string[],
) {
  logger.info("Starting link accessibility check...");
  let hasBrokenLinks = false;
  const allLinksToCheck: { dappSlug: string; url: string; type: string }[] = [];

  try {
    let slugs: string[];
    if (slugsToProcess && slugsToProcess.length > 0) {
      logger.info(
        `Checking links for specific dapps: ${slugsToProcess.join(", ")}`,
      );
      slugs = slugsToProcess;
    } else {
      logger.info("Checking links for all dapps.");
      slugs = await fs.readdir(appsDir);
    }

    for (const slug of slugs) {
      const metaPath = path.join(appsDir, slug, "meta.json");
      try {
        const fileContent = await fs.readFile(metaPath, "utf-8");
        const meta = metaJsonSchema.parse(JSON.parse(fileContent));

        if (
          meta.logoUrl.startsWith("http") &&
          !meta.logoUrl.startsWith("https://res.cloudinary.com")
        ) {
          allLinksToCheck.push({
            dappSlug: slug,
            url: meta.logoUrl,
            type: "logoUrl",
          });
        }

        for (const key in meta.links) {
          const url = meta.links[key as keyof typeof meta.links];
          if (url && typeof url === "string" && url.startsWith("http")) {
            allLinksToCheck.push({ dappSlug: slug, url, type: `link:${key}` });
          }
        }
      } catch (error: any) {
        logger.error(
          { metaPath, error },
          "Error processing meta.json for link extraction.",
        );
        hasBrokenLinks = true;
      }
    }

    const checkPromises = allLinksToCheck.map(async (link) => {
      const result = await checkLink(link.url);
      if (result.status === "accessible") {
        logger.info(
          {
            dappSlug: link.dappSlug,
            type: link.type,
            url: link.url,
            statusCode: result.statusCode,
          },
          "Link accessible.",
        );
      } else {
        logger.error(
          {
            dappSlug: link.dappSlug,
            type: link.type,
            url: link.url,
            statusCode: result.statusCode,
            error: result.error,
          },
          "Link inaccessible.",
        );
        hasBrokenLinks = true;
      }
    });

    await Promise.all(checkPromises);
  } catch (error: any) {
    logger.error(
      { error },
      "Error reading APPS_DIR or during link checking process.",
    );
    hasBrokenLinks = true;
  }

  if (hasBrokenLinks) {
    logger.error(
      "Link accessibility check failed: Some links are inaccessible.",
    );
    throw new Error("Link accessibility check failed");
  } else {
    logger.info("All external links are accessible.");
  }
}
