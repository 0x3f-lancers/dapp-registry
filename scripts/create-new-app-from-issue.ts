import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { taxonomySchema } from "../schema/taxonomySchema";
import { chainsSchema } from "../schema/chainsSchema";

interface IssuePayload {
  issue: {
    number: number;
    title: string;
    body: string;
    html_url?: string;
    user?: {
      login?: string;
    };
  };
}

export interface ParsedIssueSections {
  [label: string]: string;
}

export interface NewAppIssueParseResult {
  meta: {
    slug: string;
    name: string;
    logoUrl: string;
    category: string;
    subcategory: string[];
    chains: string[];
    tags: string[];
    pricing: string;
    content: {
      short: string;
      description: string;
      meta: string;
      pageTitle: string;
    };
    links: {
      website?: string;
      github?: string;
      docs?: string;
      twitter?: string;
      telegram?: string;
      discord?: string;
    };
    relations: {
      alternatives: string[];
      related: string[];
    };
  };
  warnings: string[];
}

interface Registries {
  categories: Set<string>;
  subcategories: Set<string>;
  categoryToSubcategories: Map<string, Set<string>>;
  chainNames: Set<string>;
}

function normalizeFieldValue(value: string | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized || normalized === "_No response_") {
    return "";
  }
  return normalized;
}

export function parseIssueSections(body: string): ParsedIssueSections {
  const sections: ParsedIssueSections = {};
  const normalizedBody = body.replace(/\r\n/g, "\n");
  const matches = Array.from(normalizedBody.matchAll(/^###\s+(.+)$/gm));

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const label = current[1].trim();
    const sectionStart = current.index! + current[0].length;
    const sectionEnd =
      i + 1 < matches.length ? matches[i + 1].index! : normalizedBody.length;
    sections[label] = normalizedBody.slice(sectionStart, sectionEnd).trim();
  }

  return sections;
}

function parseCommaSeparatedList(value: string): string[] {
  return normalizeFieldValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMultiValueList(value: string): string[] {
  return normalizeFieldValue(value)
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((item) => item.replace(/^-\s+(?:\[[x ]\]\s+)?/i, "").trim())
    .filter(Boolean);
}

function loadRegistries(baseDir: string = process.cwd()): Registries {
  const taxonomyPath = path.join(baseDir, "data", "taxonomy.json");
  const chainsPath = path.join(baseDir, "data", "chains.json");
  const taxonomy = taxonomySchema.parse(
    JSON.parse(readFileSync(taxonomyPath, "utf-8")),
  );
  const chains = chainsSchema.parse(JSON.parse(readFileSync(chainsPath, "utf-8")));

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

function parseCheckedValues(value: string): string[] {
  return normalizeFieldValue(value)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+\[x\]\s+/i.test(line))
    .map((line) => line.replace(/^-\s+\[x\]\s+/i, "").trim());
}

function parseUploadedAssetUrl(value: string): string | undefined {
  const normalized = normalizeFieldValue(value);
  if (!normalized) {
    return undefined;
  }

  const markdownLinkMatch = normalized.match(/\((https?:\/\/[^)\s]+)\)/);
  if (markdownLinkMatch?.[1]) {
    return markdownLinkMatch[1];
  }

  const rawUrlMatch = normalized.match(/https?:\/\/\S+/);
  return rawUrlMatch?.[0];
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  const sliced = value.slice(0, limit - 3);
  const trimmed = sliced.slice(0, sliced.lastIndexOf(" "));
  return `${trimmed || sliced}...`;
}

function getRequiredField(
  sections: ParsedIssueSections,
  label: string,
): string {
  const value = normalizeFieldValue(sections[label]);
  if (!value) {
    throw new Error(`Issue form field "${label}" is required.`);
  }
  return value;
}

function getOptionalField(
  sections: ParsedIssueSections,
  label: string,
): string | undefined {
  const value = normalizeFieldValue(sections[label]);
  return value || undefined;
}

export function buildNewAppMetaFromIssue(
  issueBody: string,
  existingSlugs: string[],
  registries?: Registries,
): NewAppIssueParseResult {
  const sections = parseIssueSections(issueBody);
  const warnings: string[] = [];

  const name = getRequiredField(sections, "App name");
  const slug = getRequiredField(sections, "Slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `Slug "${slug}" is not URL-safe. Use lowercase letters, numbers, and hyphens only.`,
    );
  }

  const category = getRequiredField(sections, "Category");
  const shortDescription = truncateText(
    getRequiredField(sections, "Short description"),
    200,
  );
  const fullDescription = getRequiredField(sections, "Full description");
  const logoUrl =
    getOptionalField(sections, "Logo URL") ??
    parseUploadedAssetUrl(sections["Logo upload"] ?? "");
  if (!logoUrl) {
    throw new Error('Issue form must include either "Logo URL" or "Logo upload".');
  }
  const website = getRequiredField(sections, "Website URL");
  const pricingInput = getRequiredField(sections, "Pricing");
  const pricing = pricingInput === "Not sure" ? "" : pricingInput;
  const subcategory = parseMultiValueList(
    getRequiredField(sections, "Subcategories"),
  );
  const chains = parseCheckedValues(sections["Chains"] ?? "");
  const tags = parseCommaSeparatedList(sections["Tags"] ?? "");

  const github = getOptionalField(sections, "GitHub URL");
  const docs = getOptionalField(sections, "Docs URL");
  const twitter = getOptionalField(sections, "X / Twitter URL");
  const telegram = getOptionalField(sections, "Telegram URL");
  const discord = getOptionalField(sections, "Discord URL");

  const activeRegistries = registries ?? loadRegistries();
  if (!activeRegistries.categories.has(category)) {
    throw new Error(`Category "${category}" is not in the taxonomy registry.`);
  }

  const allowedSubcategories =
    activeRegistries.categoryToSubcategories.get(category) ?? new Set<string>();
  for (const item of subcategory) {
    if (!activeRegistries.subcategories.has(item)) {
      throw new Error(`Subcategory "${item}" is not in the taxonomy registry.`);
    }
    if (!allowedSubcategories.has(item)) {
      throw new Error(
        `Subcategory "${item}" is not allowed for category "${category}".`,
      );
    }
  }

  for (const chain of chains) {
    if (!activeRegistries.chainNames.has(chain)) {
      throw new Error(`Chain "${chain}" is not in the chain registry.`);
    }
  }

  const alternativeCandidates = parseMultiValueList(
    sections["Alternative apps"] ?? "",
  );
  const relatedCandidates = parseMultiValueList(sections["Related apps"] ?? "");
  const existingSlugSet = new Set(existingSlugs);
  const alternatives = alternativeCandidates.filter((candidate) =>
    existingSlugSet.has(candidate),
  );
  const unknownAlternatives = alternativeCandidates.filter(
    (candidate) => !existingSlugSet.has(candidate),
  );
  if (unknownAlternatives.length > 0) {
    warnings.push(
      `Ignored alternatives without matching slugs: ${unknownAlternatives.join(", ")}`,
    );
  }

  const related = relatedCandidates.filter((candidate) =>
    existingSlugSet.has(candidate),
  );
  const unknownRelatedApps = relatedCandidates.filter(
    (candidate) => !existingSlugSet.has(candidate),
  );
  if (unknownRelatedApps.length > 0) {
    warnings.push(
      `Ignored related apps without matching slugs: ${unknownRelatedApps.join(", ")}`,
    );
  }

  const metaDescription = truncateText(
    `${shortDescription} Discover ${name} and other ${category} on Lancers Web3 Explorer.`,
    200,
  );

  return {
    meta: {
      slug,
      name,
      logoUrl,
      category,
      subcategory,
      chains,
      tags,
      pricing,
      content: {
        short: shortDescription,
        description: fullDescription,
        meta: metaDescription,
        pageTitle: `${name} - ${category} - Lancers Web3 Explorer`,
      },
      links: {
        website,
        ...(github ? { github } : {}),
        ...(docs ? { docs } : {}),
        ...(twitter ? { twitter } : {}),
        ...(telegram ? { telegram } : {}),
        ...(discord ? { discord } : {}),
      },
      relations: {
        alternatives,
        related,
      },
    },
    warnings,
  };
}

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function appendGithubOutput(key: string, value: string) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  writeFileSync(outputPath, `${key}=${value}\n`, { flag: "a" });
}

function main() {
  const eventPath =
    parseArg("--event-path") ?? process.env.GITHUB_EVENT_PATH;
  const appsDir =
    parseArg("--apps-dir") ?? path.join(process.cwd(), "src", "apps");

  if (!eventPath) {
    throw new Error("Missing --event-path and GITHUB_EVENT_PATH.");
  }

  const event = JSON.parse(readFileSync(eventPath, "utf-8")) as IssuePayload;
  const issue = event.issue;

  if (!issue?.body) {
    throw new Error("Issue body is empty.");
  }

  const existingSlugs = existsSync(appsDir) ? readdirSync(appsDir) : [];
  const { meta, warnings } = buildNewAppMetaFromIssue(
    issue.body,
    existingSlugs,
    loadRegistries(),
  );

  const appsRoot = path.resolve(appsDir);
  const appDir = path.resolve(appsRoot, meta.slug);
  if (!appDir.startsWith(`${appsRoot}${path.sep}`)) {
    throw new Error("Slug attempts path traversal.");
  }

  const metaPath = path.join(appDir, "meta.json");
  if (existsSync(appDir) || existsSync(metaPath)) {
    throw new Error(`App slug "${meta.slug}" already exists.`);
  }

  mkdirSync(appDir, { recursive: true });
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");

  appendGithubOutput("meta_path", metaPath);
  appendGithubOutput("slug", meta.slug);
  appendGithubOutput("app_name", meta.name);

  console.log(`Generated ${metaPath} from issue #${issue.number}.`);
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
