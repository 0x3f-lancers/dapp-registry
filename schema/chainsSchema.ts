import { z } from "zod";

const chainSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.url().optional(),
});

export const chainsSchema = z.object({
  chains: z.array(chainSchema),
});

export type ChainsRegistry = z.infer<typeof chainsSchema>;
