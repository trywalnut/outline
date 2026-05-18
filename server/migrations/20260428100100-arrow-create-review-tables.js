"use strict";

/**
 * arrow-approvals plugin migration.
 *
 * Creates two tables:
 *   arrow_review_requests   one per (document, review-cycle); state machine lives here
 *   arrow_review_actions    append-only audit log of approve/request-changes/cancel
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // ── arrow_review_requests ─────────────────────────────────────────
      await queryInterface.createTable(
        "arrow_review_requests",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          documentId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "documents", key: "id" },
            onDelete: "CASCADE",
          },
          requestedById: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
          },
          requiredReviewers: {
            // Array of user IDs that must (collectively) approve.
            type: Sequelize.JSONB,
            allowNull: false,
          },
          threshold: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          state: {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: "pending",
          },
          revisionId: {
            // The document revision this review request was opened against.
            type: Sequelize.UUID,
            allowNull: true,
          },
          completedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );

      // Fast lookup of "is there an open review on this doc?" — used by
      // the document edit-lock hook on every Document update.
      await queryInterface.addIndex(
        "arrow_review_requests",
        ["documentId", "state"],
        { name: "arrow_review_requests_doc_state_idx", transaction }
      );

      // Inbox queries: "specs awaiting my review" and "my pending specs."
      await queryInterface.addIndex(
        "arrow_review_requests",
        ["requestedById", "state"],
        { name: "arrow_review_requests_author_state_idx", transaction }
      );

      // ── arrow_review_actions ──────────────────────────────────────────
      await queryInterface.createTable(
        "arrow_review_actions",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          requestId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "arrow_review_requests", key: "id" },
            onDelete: "CASCADE",
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
          },
          action: {
            // One of: approve, request_changes, cancel, re_request, unlock
            type: Sequelize.STRING(32),
            allowNull: false,
          },
          body: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          revisionId: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );

      // For "specs Yash already approved" guard rails (already_acted check).
      await queryInterface.addIndex(
        "arrow_review_actions",
        ["requestId", "userId", "action"],
        { name: "arrow_review_actions_request_user_action_idx", transaction }
      );
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("arrow_review_actions", { transaction });
      await queryInterface.dropTable("arrow_review_requests", { transaction });
    });
  },
};
