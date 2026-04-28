import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const ReviewsRequestSchema = BaseSchema.extend({
  body: z.object({
    documentId: z.string().uuid(),
    reviewers: z.array(z.string().uuid()).min(1),
    threshold: z.number().int(),
  }),
});
export type ReviewsRequestReq = z.infer<typeof ReviewsRequestSchema>;

export const ReviewsApproveSchema = BaseSchema.extend({
  body: z.object({
    requestId: z.string().uuid(),
    comment: z.string().optional(),
  }),
});
export type ReviewsApproveReq = z.infer<typeof ReviewsApproveSchema>;

export const ReviewsRequestChangesSchema = BaseSchema.extend({
  body: z.object({
    requestId: z.string().uuid(),
    comment: z.string().min(1, "comment_required"),
  }),
});
export type ReviewsRequestChangesReq = z.infer<typeof ReviewsRequestChangesSchema>;

export const ReviewsCancelSchema = BaseSchema.extend({
  body: z.object({ requestId: z.string().uuid() }),
});
export type ReviewsCancelReq = z.infer<typeof ReviewsCancelSchema>;

export const ReviewsReRequestSchema = BaseSchema.extend({
  body: z.object({ documentId: z.string().uuid() }),
});
export type ReviewsReRequestReq = z.infer<typeof ReviewsReRequestSchema>;

export const ReviewsUnlockSchema = BaseSchema.extend({
  body: z.object({ documentId: z.string().uuid() }),
});
export type ReviewsUnlockReq = z.infer<typeof ReviewsUnlockSchema>;

export const ReviewsInfoSchema = BaseSchema.extend({
  body: z.object({ documentId: z.string().uuid() }),
});
export type ReviewsInfoReq = z.infer<typeof ReviewsInfoSchema>;

export const ReviewsListSchema = BaseSchema.extend({
  body: z.object({
    filter: z.enum(["awaiting_me", "my_pending"]),
  }),
});
export type ReviewsListReq = z.infer<typeof ReviewsListSchema>;
