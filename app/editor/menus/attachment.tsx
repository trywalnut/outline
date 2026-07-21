import { t } from "i18next";
import {
  TrashIcon,
  CommentIcon,
  DownloadIcon,
  ReplaceIcon,
  PDFIcon,
  BrowserIcon,
} from "outline-icons";
import { NodeSelection } from "prosemirror-state";
import FileHelper from "@shared/editor/lib/FileHelper";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import { isPDFAttachmentActive } from "@shared/editor/queries/isPDFAttachment";
import type { MenuItem, SelectionContext } from "@shared/editor/types";

/**
 * Returns menu items for the attachment selection toolbar.
 *
 * @param ctx - the current selection context.
 * @returns an array of menu items.
 */
export default function attachmentMenuItems(ctx: SelectionContext): MenuItem[] {
  if (ctx.readOnly) {
    return [];
  }

  const { schema, state } = ctx;
  const isAttachmentWithPreview = isNodeActive(schema.nodes.attachment, {
    preview: true,
  });
  const selectedAttachment =
    state.selection instanceof NodeSelection &&
    state.selection.node.type === schema.nodes.attachment
      ? state.selection.node
      : undefined;
  const isPdfAttachment = isPDFAttachmentActive(state);
  const isHtmlAttachment = FileHelper.isHtml(
    selectedAttachment?.attrs.contentType,
    selectedAttachment?.attrs.title
  );
  const isPreviewableAttachment = isPdfAttachment || isHtmlAttachment;

  return [
    {
      name: "replaceAttachment",
      tooltip: t("Replace file"),
      icon: <ReplaceIcon />,
    },
    {
      name: "deleteAttachment",
      tooltip: t("Delete file"),
      icon: <TrashIcon />,
    },
    {
      name: "commentOnAttachment",
      tooltip: t("Comment"),
      icon: <CommentIcon />,
    },
    {
      name: "toggleAttachmentPreview",
      tooltip: t("Show preview"),
      icon: isHtmlAttachment ? <BrowserIcon /> : <PDFIcon />,
      active: isAttachmentWithPreview,
      visible: isPreviewableAttachment,
    },
    {
      name: "separator",
    },
    {
      name: "dimensions",
      tooltip: `${t("Width")} × ${t("Height")}`,
      visible: isAttachmentWithPreview(state),
      skipIcon: true,
    },
    {
      name: "separator",
    },
    {
      name: "downloadAttachment",
      label: t("Download"),
      icon: <DownloadIcon />,
      visible: !!fetch,
    },
  ];
}
