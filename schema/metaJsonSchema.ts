import { z } from "zod";

export const metaJsonSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().min(1, "Logo URL cannot be empty"),
  category: z.string(),
  subcategory: z.array(z.string()),
  chains: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  pricing: z.string(),
  archived: z.boolean().default(false),
  content: z.object({
    short: z.string().max(200),
    description: z.string(),
    meta: z.string().max(200),
    pageTitle: z.string(),
  }),
  links: z
    .object({
      website: z.url().optional(),
      github: z.url().optional(),
      docs: z.url().optional(),
      twitter: z.url().optional(),
      telegram: z.url().optional(),
      discord: z.url().optional(),
    })
    .refine((links) => links.website || links.github, {
      message: "At least one of 'website' or 'github' is required",
    }),
  relations: z.object({
    alternatives: z.array(z.string()),
    related: z.array(z.string()),
  }),
  // Curated educational reading about this app. Optional and deliberately
  // sparse: only added where genuinely good material exists, so the detail
  // page carries something no other page has. Absent => the UI renders
  // nothing (no empty state).
  //
  // Detail-page only. Never copy this into appsMinSchema / distill's
  // appEntry -- apps.min.json is loaded by every listing page and must stay
  // small.
  resources: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        // Written by us, never pasted from the source (pasted text would be
        // duplicate content, which is the problem this field exists to fix).
        tldr: z.string().min(40).max(300),
        url: z.url(),
        source: z.string().min(1).max(80),
        publishedAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "publishedAt must be YYYY-MM-DD")
          .optional(),
      }),
    )
    // Three is the cap. This is a curated shortlist; more turns the section
    // into a link dump and dilutes the value of each entry.
    .max(3)
    .optional(),
});
