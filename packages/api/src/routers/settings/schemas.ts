import { z } from "zod";

export const updateLocaleSchema = z.object({
  locale: z.string().min(1).max(10),
});
