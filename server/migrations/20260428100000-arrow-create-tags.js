"use strict";

/**
 * arrow-tags plugin migration: creates `arrow_tags` and `arrow_document_tags`
 * tables. Filename uses an `arrow-` infix so future-us can grep all
 * arrow-fork migrations easily; placed in server/migrations/ alongside core
 * because that's where Outline's sequelize-cli looks.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "arrow_tags",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          teamId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "teams", key: "id" },
            onDelete: "CASCADE",
          },
          name: {
            type: Sequelize.STRING(30),
            allowNull: false,
          },
          color: {
            type: Sequelize.STRING(7),
            allowNull: true,
          },
          createdById: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );

      // Case-insensitive uniqueness within a team.
      // Postgres lets us index on a function for this — works for the
      // "Appeals" / "appeals" duplication-guard scenario.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX arrow_tags_team_lower_name_uq
           ON arrow_tags ("teamId", LOWER("name"))`,
        { transaction }
      );

      await queryInterface.createTable(
        "arrow_document_tags",
        {
          tagId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "arrow_tags", key: "id" },
            onDelete: "CASCADE",
            primaryKey: true,
          },
          documentId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "documents", key: "id" },
            onDelete: "CASCADE",
            primaryKey: true,
          },
          addedById: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
          },
          addedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
        },
        { transaction }
      );

      await queryInterface.addIndex("arrow_document_tags", ["documentId"], {
        name: "arrow_document_tags_document_idx",
        transaction,
      });
      await queryInterface.addIndex("arrow_document_tags", ["tagId"], {
        name: "arrow_document_tags_tag_idx",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("arrow_document_tags", { transaction });
      await queryInterface.dropTable("arrow_tags", { transaction });
    });
  },
};
