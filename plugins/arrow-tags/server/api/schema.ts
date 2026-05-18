import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

/**
 * Request schemas for arrow-tags endpoints. Each maps 1:1 to a Cucumber
 * scenario in tags.feature; the rejection reasons surface as the value of
 * `reason` in the API response so step defs can assert against them.
 */

export const TagsCreateSchema = BaseSchema.extend({
  body: z.object({
    name: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .min(1, "invalid_tag_name")
          .max(30, "invalid_tag_name")
      ),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "invalid_color")
      .optional(),
  }),
});
export type TagsCreateReq = z.infer<typeof TagsCreateSchema>;

export const TagsListSchema = BaseSchema.extend({
  body: z.object({}).passthrough(),
});

export const TagsDeleteSchema = BaseSchema.extend({
  body: z.object({ id: z.string().uuid() }),
});
export type TagsDeleteReq = z.infer<typeof TagsDeleteSchema>;

export const DocumentsAddTagSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.string().uuid(),
    tagId: z.string().uuid(),
  }),
});
export type DocumentsAddTagReq = z.infer<typeof DocumentsAddTagSchema>;

export const DocumentsRemoveTagSchema = DocumentsAddTagSchema;
export type DocumentsRemoveTagReq = z.infer<typeof DocumentsRemoveTagSchema>;

export const DocumentsTagsSchema = BaseSchema.extend({
  body: z.object({ documentId: z.string().uuid() }),
});
export type DocumentsTagsReq = z.infer<typeof DocumentsTagsSchema>;

export const DocumentsListByTagSchema = BaseSchema.extend({
  body: z.object({
    tagIds: z.array(z.string()).min(1),
    mode: z.enum(["any", "intersection"]).default("any"),
  }),
});
export type DocumentsListByTagReq = z.infer<typeof DocumentsListByTagSchema>;
