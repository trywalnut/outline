import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  Length,
  Table,
} from "sequelize-typescript";
import Document from "@server/models/Document";
import Team from "@server/models/Team";
import User from "@server/models/User";
import IdModel from "@server/models/base/IdModel";
import Fix from "@server/models/decorators/Fix";

/**
 * A tag is a named, color-coded label scoped to a team. Tags are reusable
 * across documents — applying the same tag to two docs creates two rows in
 * the join table, not two tags.
 *
 * Uniqueness is enforced case-insensitively per-team via a Postgres
 * functional unique index (see migration 20260428100000-arrow-create-tags.js).
 *
 * Validation rules (matched by tags.feature scenarios):
 *   - Name: trimmed, non-empty, ≤30 characters
 *   - Color: optional 7-char hex like "#f5a400"
 */
@Table({ tableName: "arrow_tags", modelName: "arrow_tag", timestamps: true })
@Fix
class ArrowTag extends IdModel<
  InferAttributes<ArrowTag>,
  Partial<InferCreationAttributes<ArrowTag>>
> {
  static MAX_NAME_LENGTH = 30;
  static MAX_TAGS_PER_DOCUMENT = 20;

  @Length({
    min: 1,
    max: 30,
    msg: "Tag name must be between 1 and 30 characters",
  })
  @Column(DataType.STRING(30))
  name: string;

  @Column(DataType.STRING(7))
  color: string | null;

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => User, "createdById")
  createdBy: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  createdById: string;

  @BelongsToMany(() => Document, {
    through: { model: () => require("./ArrowDocumentTag").default },
    foreignKey: "tagId",
    otherKey: "documentId",
  })
  documents: Document[];
}

export default ArrowTag;
