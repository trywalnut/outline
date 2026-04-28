import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import Document from "@server/models/Document";
import User from "@server/models/User";
import IdModel from "@server/models/base/IdModel";
import Fix from "@server/models/decorators/Fix";

export type ReviewState =
  | "pending"
  | "approved"
  | "changes_requested"
  | "cancelled";

/**
 * A single review cycle on a document.
 *
 * Lifecycle (state machine, see ArrowApprovalEngine for transition rules):
 *
 *   pending ──approve (≥threshold)──> approved (terminal until unlock)
 *   pending ──approve (<threshold)──> pending
 *   pending ──request_changes──────> changes_requested
 *   pending ──cancel───────────────> cancelled (terminal)
 *   changes_requested ──re_request─> pending  (only if doc edited since)
 *   approved ──unlock──────────────> deleted (a new request must be opened)
 *
 * Multiple review requests can exist for the same document over its
 * lifetime — but only ONE may be in `pending` or `changes_requested` state
 * simultaneously (enforced by the API, not the schema).
 */
@Table({
  tableName: "arrow_review_requests",
  modelName: "arrow_review_request",
  timestamps: true,
})
@Fix
class ArrowReviewRequest extends IdModel<
  InferAttributes<ArrowReviewRequest>,
  Partial<InferCreationAttributes<ArrowReviewRequest>>
> {
  @Column(DataType.JSONB)
  requiredReviewers: string[];

  @Column(DataType.INTEGER)
  threshold: number;

  @Default("pending")
  @Column(DataType.STRING(32))
  state: ReviewState;

  @Column(DataType.UUID)
  revisionId: string | null;

  @Column(DataType.DATE)
  completedAt: Date | null;

  // associations

  @BelongsTo(() => Document, "documentId")
  document: Document;

  @ForeignKey(() => Document)
  @Column(DataType.UUID)
  documentId: string;

  @BelongsTo(() => User, "requestedById")
  requestedBy: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  requestedById: string;

  @HasMany(() => require("./ArrowReviewAction").default, "requestId")
  actions: any[];
}

export default ArrowReviewRequest;
