import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import User from "@server/models/User";
import IdModel from "@server/models/base/IdModel";
import Fix from "@server/models/decorators/Fix";
import ArrowReviewRequest from "./ArrowReviewRequest";

export type ReviewActionType =
  | "approve"
  | "request_changes"
  | "cancel"
  | "re_request"
  | "unlock";

/**
 * Audit log of every action taken on a review request. Append-only —
 * actions are never edited or deleted (a regret is expressed by adding
 * another action, e.g. "request_changes" after a previous "approve").
 *
 * The `revisionId` captures which document revision the action was taken
 * against, so we can later answer "approved as of which revision?" for
 * traceability between specs and the tests/code derived from them.
 */
@Table({
  tableName: "arrow_review_actions",
  modelName: "arrow_review_action",
  timestamps: true,
})
@Fix
class ArrowReviewAction extends IdModel<
  InferAttributes<ArrowReviewAction>,
  Partial<InferCreationAttributes<ArrowReviewAction>>
> {
  @Column(DataType.STRING(32))
  action: ReviewActionType;

  @Column(DataType.TEXT)
  body: string | null;

  @Column(DataType.UUID)
  revisionId: string | null;

  // associations

  @BelongsTo(() => ArrowReviewRequest, "requestId")
  request: ArrowReviewRequest;

  @ForeignKey(() => ArrowReviewRequest)
  @Column(DataType.UUID)
  requestId: string;

  @BelongsTo(() => User, "userId")
  user: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId: string;
}

export default ArrowReviewAction;
