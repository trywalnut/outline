import { BrowserIcon, OpenIcon } from "outline-icons";
import * as React from "react";
import Widget from "./Widget";

type Props = {
  /** The href of the artifact attachment. */
  href: string;
  /** The title of the artifact. */
  title: string;
  /** Human-readable file size, shown as context. */
  context: React.ReactNode;
  /** Whether the node is currently selected. */
  isSelected: boolean;
  /**
   * Open the artifact in the center viewer. Pass `{ auto: true }` for the
   * automatic open that fires once when the document loads.
   */
  onOpen: (options?: { auto?: boolean }) => void;
};

/**
 * Renders an HTML artifact as a compact card in the document body. Opens the
 * artifact in the center viewer automatically when it first renders, and again
 * whenever the card is clicked.
 */
export default function ArtifactCard({
  href,
  title,
  context,
  isSelected,
  onOpen,
}: Props) {
  React.useEffect(() => {
    onOpen({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Widget
      icon={<BrowserIcon />}
      href={href}
      title={title}
      context={context}
      isSelected={isSelected}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
    >
      <OpenIcon size={20} />
    </Widget>
  );
}
