import { z } from "zod";

const facetOptionSchema = z.object({
  slug: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const facetsIndexSchema = z.object({
  options: z.object({
    network: z.array(facetOptionSchema),
    category: z.array(facetOptionSchema),
    subcategory: z.array(facetOptionSchema),
  }),
  index: z.object({
    network: z.record(z.string(), z.array(z.string())),
    category: z.record(z.string(), z.array(z.string())),
    subcategory: z.record(z.string(), z.array(z.string())),
  }),
});

export type FacetsIndex = z.infer<typeof facetsIndexSchema>;
export type FacetOption = z.infer<typeof facetOptionSchema>;
