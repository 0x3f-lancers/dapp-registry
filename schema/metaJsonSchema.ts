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
        // 155 is what fits a Learn card without clipping. The card renders
        // `tldr` in full and never truncates, so anything longer would
        // overflow the design rather than be quietly cut -- keep it here.
        tldr: z.string().min(40).max(155),
        url: z.url(),
        source: z.string().min(1).max(80),
        // Topic label shown on the card in place of the publisher name, so a
        // reader can tell at a glance what kind of read this is.
        //
        // Optional because it is backfilled by enrich-resources.ts after
        // apply-resources.ts writes the entry; requiring it here would make
        // every hand-written selections file fail to apply.
        tag: z
          .enum([
            "Security",
            "Research",
            "Tutorial",
            "Explainer",
            "Regulation",
            "DeFi",
            "Infrastructure",
            "AI & Agents",
            "Identity",
            "Payments",
            "Governance",
            "Tokenization",
            "Trading",
            "Finance",
          ])
          .optional(),
        // The article's own og:image. Absent when the page declares none, in
        // which case the card falls back to a local placeholder.
        //
        // Must be a public https URL. Some sites publish a build-time og:image
        // pointing at their own dev server, and next/image throws a runtime
        // error on a host it has not been told about -- so a bad value here
        // takes the whole page down rather than degrading.
        image: z
          .url()
          .refine(
            (u) => {
              try {
                const { protocol, hostname } = new URL(u);
                return (
                  protocol === 'https:' &&
                  hostname.includes('.') &&
                  !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/i.test(hostname)
                );
              } catch {
                return false;
              }
            },
            { message: 'image must be a public https URL' },
          )
          .optional(),
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
