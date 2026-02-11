import { z } from "zod";
import { taxonomySchema } from "./taxonomySchema";

const facetOptionSchema = z.object({
  slug: z.string(),
  label: z.string(),
  stats: z.number().int().nonnegative(),
});

export const facetsIndexSchema = z.object({
  filterableOptions: z.object({
    network: z.array(facetOptionSchema),
    category: z.array(facetOptionSchema),
    subcategory: z.array(facetOptionSchema),
    tags: z.array(facetOptionSchema),
  }),
  buckets: z.object({
    network: z.record(z.string(), z.array(z.string())),
    category: z.record(z.string(), z.array(z.string())),
    subcategory: z.record(z.string(), z.array(z.string())),
    tags: z.record(z.string(), z.array(z.string())),
  }),
  stats: z.number().int().nonnegative(),
  counts: z.object({
    apps: z.number().int().nonnegative(),
    networks: z.number().int().nonnegative(),
    categories: z.number().int().nonnegative(),
    subcategories: z.number().int().nonnegative(),
  }),
  labels: z.object({
    network: z.record(z.string(), z.string()),
    category: z.record(z.string(), z.string()),
    subcategory: z.record(z.string(), z.string()),
  }),
  assets: z.object({
    networkLogos: z.record(z.string(), z.string()),
  }),
  taxonomy: taxonomySchema,
});

export type FacetsIndex = z.infer<typeof facetsIndexSchema>;
export type FacetOption = z.infer<typeof facetOptionSchema>;
