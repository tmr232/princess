import { z } from "zod";

export const symbolSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["class", "function", "module"]),
  parent: z.string().nullable(),
  start: z.number(),
  end: z.number(),
  line: z.number(),
});
export type SymbolInfo = z.infer<typeof symbolSchema>;
export const changeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["class", "function", "module"]),
  parent: z.string().nullable(),
  status: z.enum(["added", "removed", "modified"]),
  before: symbolSchema.nullable(),
  after: symbolSchema.nullable(),
});
export type Change = z.infer<typeof changeSchema>;
export const reviewSchema = z.object({
  base: z.string(),
  head: z.string(),
  repo: z.string(),
  files: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      oldPath: z.string(),
      status: z.string(),
      supported: z.boolean(),
      changes: z.array(changeSchema),
    }),
  ),
});
export type Review = z.infer<typeof reviewSchema>;
