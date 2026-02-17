import { z } from 'zod';

export const appsMinSchema = z.array(
  z.object({
    slug: z.string(),
    name: z.string(),
    logoUrl: z.string(),
    category: z.string(),
    subcategory: z.array(z.string()),
    chains: z.array(z.string()),
    tags: z.array(z.string()),
    short: z.string(),
    links: z
      .object({
        website: z.string().optional(),
        github: z.string().optional(),
        docs: z.string().optional(),
        twitter: z.string().optional(),
        telegram: z.string().optional(),
        discord: z.string().optional(),
      })
      .optional(),
  }),
);
