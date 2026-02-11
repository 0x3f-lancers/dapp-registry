import { z } from "zod";

export const taxonomySchema = z.object({
  categories: z.array(z.string()),
  subcategories: z.array(z.string()),
  category_to_subcategories: z.record(z.string(), z.array(z.string())),
  subcategory_to_categories: z.record(z.string(), z.array(z.string())),
});

export type Taxonomy = z.infer<typeof taxonomySchema>;
