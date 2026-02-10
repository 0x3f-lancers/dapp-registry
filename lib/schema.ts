import { z } from "zod";

export const metaJsonSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().min(1, "Logo URL cannot be empty"),
  category: z.string(),
  chains: z.array(z.string()),
  tags: z.array(z.string()),
  pricing: z.string(),
  content: z.object({
    short: z.string().max(160),
    description: z.string(),
    meta: z.string().max(160),
    pageTitle: z.string(),
  }),
  links: z
    .object({
      website: z.string().url().optional(),
      github: z.string().url().optional(),
      docs: z.string().url().optional(),
      twitter: z.string().url().optional(),
      telegram: z.string().url().optional(),
      discord: z.string().url().optional(),
    })
    .refine((links) => links.website || links.github, {
      message: "At least one of 'website' or 'github' is required",
    }),
  relations: z.object({
    alternatives: z.array(z.string()),
    related: z.array(z.string()),
  }),
  source: z
    .object({
      fullyScraped: z.boolean().default(true),
    })
    .optional(),
});

export const appsMinSchema = z.array(
  z.object({
    slug: z.string(),
    name: z.string(),
    logoUrl: z.string(),
    category: z.string(),
    chains: z.array(z.string()),
    tags: z.array(z.string()),
    pricing: z.string(),
    short: z.string(),
    updatedAt: z.string().datetime(),
  }),
);
