import type { TFunction } from "i18next";
import {
  TrashIcon,
  DownloadIcon,
  ReplaceIcon,
  PDFIcon,
  BrowserIcon,
} from "outline-icons";
import { NodeSelection, type EditorState } from "prosemirror-state";
import FileHelper from "@shared/editor/lib/FileHelper";
import type { MenuItem } from "@shared/editor/types";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";

export default function attachmentMenuItems(
  state: EditorState,
  readOnly: boolean,
  t: TFunction
): MenuItem[] {
  if (readOnly) {
    return [];
  }

  const { schema } = state;
  const isAttachmentWithPreview = isNodeActive(schema.nodes.attachment, {
    preview: true,
  });
  const selectedAttachment =
    state.selection instanceof NodeSelection &&
    state.selection.node.type === schema.nodes.attachment
      ? state.selection.node
      : undefined;
  const isPdfAttachment =
    selectedAttachment?.attrs.contentType === "application/pdf";
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
