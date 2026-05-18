import Router from "koa-router";
import { Op, UniqueConstraintError } from "sequelize";
import httpErrors from "http-errors";
import { Document } from "@server/models";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
import ArrowDocumentTag from "../models/ArrowDocumentTag";
import ArrowTag from "../models/ArrowTag";
import { presentArrowTag } from "../presenters/arrowTag";
import "../policies/arrowTag"; // register cancan rules
import {
  TagsCreateSchema,
  TagsListSchema,
  TagsDeleteSchema,
  DocumentsAddTagSchema,
  DocumentsRemoveTagSchema,
  DocumentsTagsSchema,
  DocumentsListByTagSchema,
  type TagsCreateReq,
  type TagsDeleteReq,
  type DocumentsAddTagReq,
  type DocumentsRemoveTagReq,
  type DocumentsTagsReq,
  type DocumentsListByTagReq,
} from "./schema";

/**
 * arrow-tags HTTP API. Mounted under /api by the plugin entry.
 *
 * Conventions:
 *   - All routes are POST (matching the rest of Outline's API).
 *   - Errors use the `id` field on httpErrors as the machine-readable reason.
 *   - Responses follow Outline's `{ data, status, ok }` envelope, supplied
 *     automatically by the API middleware.
 */
const router = new Router();

// ── Tags CRUD ─────────────────────────────────────────────────────────────

router.post(
  "arrow.tags.create",
  auth(),
  validate(TagsCreateSchema),
  transaction(),
  async (ctx: APIContext<TagsCreateReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { name, color } = ctx.input.body;

    authorize(user, "createArrowTag", user);

    try {
      const tag = await ArrowTag.create(
        { name: name.trim(), color: color ?? null, teamId: user.teamId, createdById: user.id },
        { transaction: tx }
      );
      ctx.body = { data: presentArrowTag(tag) };
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw httpErrors(409, "tag with this name already exists", {
          id: "tag_name_already_exists",
          isReportable: false,
        });
      }
      throw err;
    }
  }
);

router.post(
  "arrow.tags.list",
  auth(),
  validate(TagsListSchema),
  async (ctx: APIContext) => {
    const { user } = ctx.state.auth;
    authorize(user, "listArrowTag", user);

    const tags = await ArrowTag.findAll({
      where: { teamId: user.teamId },
      order: [["name", "ASC"]],
    });
    ctx.body = { data: { tags: tags.map(presentArrowTag) } };
  }
);

router.post(
  "arrow.tags.delete",
  auth(),
  validate(TagsDeleteSchema),
  transaction(),
  async (ctx: APIContext<TagsDeleteReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { id } = ctx.input.body;

    const tag = await ArrowTag.findByPk(id, { transaction: tx });
    if (!tag || tag.teamId !== user.teamId) {
      throw httpErrors(404, "tag not found", {
        id: "not_found",
        isReportable: false,
      });
    }

    try {
      authorize(user, "deleteArrowTag", tag);
    } catch {
      throw httpErrors(403, "permission denied", {
        id: "permission_denied",
        isReportable: false,
      });
    }

    await tag.destroy({ transaction: tx });
    ctx.body = { success: true };
  }
);

// ── Document ↔ Tag association ────────────────────────────────────────────

router.post(
  "arrow.documents.addTag",
  auth(),
  validate(DocumentsAddTagSchema),
  transaction(),
  async (ctx: APIContext<DocumentsAddTagReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { documentId, tagId } = ctx.input.body;

    const [doc, tag] = await Promise.all([
      Document.findByPk(documentId, { userId: user.id, transaction: tx }),
      ArrowTag.findByPk(tagId, { transaction: tx }),
    ]);

    if (!tag || tag.teamId !== user.teamId) {
      throw httpErrors(404, "tag not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    if (!doc) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }

    // Edit permission required to mutate the document's metadata.
    try {
      authorize(user, "update", doc);
    } catch {
      throw httpErrors(403, "permission denied", {
        id: "permission_denied",
        isReportable: false,
      });
    }

    // Enforce the 20-tags-per-document limit before insert.
    const currentCount = await ArrowDocumentTag.count({
      where: { documentId },
      transaction: tx,
    });
    if (currentCount >= ArrowTag.MAX_TAGS_PER_DOCUMENT) {
      throw httpErrors(409, "too many tags on this document", {
        id: "tag_limit_exceeded",
        isReportable: false,
      });
    }

    // Idempotent insert — composite PK (tagId, documentId) gives us "exactly once".
    await ArrowDocumentTag.upsert(
      { tagId, documentId, addedById: user.id, addedAt: new Date() },
      { transaction: tx }
    );

    ctx.body = { success: true };
  }
);

router.post(
  "arrow.documents.removeTag",
  auth(),
  validate(DocumentsRemoveTagSchema),
  transaction(),
  async (ctx: APIContext<DocumentsRemoveTagReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { documentId, tagId } = ctx.input.body;

    const doc = await Document.findByPk(documentId, {
      userId: user.id,
      transaction: tx,
    });
    if (!doc) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }

    try {
      authorize(user, "update", doc);
    } catch {
      throw httpErrors(403, "permission denied", {
        id: "permission_denied",
        isReportable: false,
      });
    }

    await ArrowDocumentTag.destroy({
      where: { documentId, tagId },
      transaction: tx,
    });
    ctx.body = { success: true };
  }
);

router.post(
  "arrow.documents.tags",
  auth(),
  validate(DocumentsTagsSchema),
  async (ctx: APIContext<DocumentsTagsReq>) => {
    const { user } = ctx.state.auth;
    const { documentId } = ctx.input.body;

    const doc = await Document.findByPk(documentId, { userId: user.id });
    if (!doc) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    authorize(user, "read", doc);

    const links = await ArrowDocumentTag.findAll({
      where: { documentId },
      include: [{ association: "tag" }],
    });
    ctx.body = {
      data: { tags: links.map((l) => presentArrowTag(l.tag)) },
    };
  }
);

router.post(
  "arrow.documents.listByTag",
  auth(),
  validate(DocumentsListByTagSchema),
  async (ctx: APIContext<DocumentsListByTagReq>) => {
    const { user } = ctx.state.auth;
    const { tagIds, mode } = ctx.input.body;

    // Verify the tags exist within this team.
    const tags = await ArrowTag.findAll({
      where: { id: { [Op.in]: tagIds }, teamId: user.teamId },
    });
    if (tags.length === 0) {
      ctx.body = { data: { documents: [] } };
      return;
    }

    let documentIds: string[];
    if (mode === "intersection") {
      // Each doc must have ALL requested tags.
      const found = await ArrowDocumentTag.findAll({
        where: { tagId: { [Op.in]: tags.map((t) => t.id) } },
        attributes: ["documentId", "tagId"],
      });
      const counts = new Map<string, number>();
      for (const link of found) {
        counts.set(link.documentId, (counts.get(link.documentId) ?? 0) + 1);
      }
      documentIds = [...counts.entries()]
        .filter(([, n]) => n === tags.length)
        .map(([id]) => id);
    } else {
      const found = await ArrowDocumentTag.findAll({
        where: { tagId: { [Op.in]: tags.map((t) => t.id) } },
        attributes: ["documentId"],
      });
      documentIds = [...new Set(found.map((f) => f.documentId))];
    }

    if (documentIds.length === 0) {
      ctx.body = { data: { documents: [] } };
      return;
    }

    const documents = await Document.findAll({
      where: { id: { [Op.in]: documentIds }, teamId: user.teamId },
      attributes: ["id", "title", "urlId"],
      order: [["title", "ASC"]],
    });

    ctx.body = {
      data: {
        documents: documents.map((d) => ({
          id: d.id,
          title: d.title,
          urlId: d.urlId,
        })),
      },
    };
  }
);

export default router;
