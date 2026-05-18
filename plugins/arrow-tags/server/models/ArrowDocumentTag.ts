import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import Document from "@server/models/Document";
import User from "@server/models/User";
import Model from "@server/models/base/Model";
import Fix from "@server/models/decorators/Fix";
import ArrowTag from "./ArrowTag";

/**
 * Junction table connecting tags to documents. Composite primary key is
 * (tagId, documentId) so the same tag can't be applied to the same doc twice
 * — the "adding the same tag twice is a no-op" scenario relies on this:
 * the API uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * `addedById` and `addedAt` capture audit info for the
 * "document records that <user> added the tag" assertion in tags.feature.
 */
@Table({
  tableName: "arrow_document_tags",
  modelName: "arrow_document_tag",
  timestamps: false,
})
@Fix
class ArrowDocumentTag extends Model<
  InferAttributes<ArrowDocumentTag>,
  Partial<InferCreationAttributes<ArrowDocumentTag>>
> {
  @ForeignKey(() => ArrowTag)
  @Column({ type: DataType.UUID, primaryKey: true })
  tagId: string;

  @ForeignKey(() => Document)
  @Column({ type: DataType.UUID, primaryKey: true })
  documentId: string;

  @BelongsTo(() => User, "addedById")
  addedBy: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  addedById: string;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
    allowNull: false,
  })
  addedAt: Date;

  @BelongsTo(() => ArrowTag, "tagId")
  tag: ArrowTag;

  @BelongsTo(() => Document, "documentId")
  document: Document;
}

export default ArrowDocumentTag;
