import { z } from "zod";

export const chainLogosSchema = z.object({
  name_to_url: z.record(z.string(), z.url()),
});

export type ChainLogos = z.infer<typeof chainLogosSchema>;
