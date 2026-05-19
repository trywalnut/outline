import * as React from "react";
import {
  BrowserIcon,
  CodeIcon,
  CopyIcon,
  OpenIcon,
  WarningIcon,
} from "outline-icons";
import { toast } from "sonner";
import styled from "styled-components";
import Flex from "../../components/Flex";
import { s } from "../../styles";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";
import type { ComponentProps } from "../types";
import { ResizeBottom, ResizeLeft, ResizeRight } from "./ResizeHandle";
import { Preview, Subtitle, Title } from "./Widget";
import useDragResize from "./hooks/useDragResize";

type Props = ComponentProps & {
  /** Icon to display on the left side of the widget */
  icon: React.ReactNode;
  /** Title of the widget */
  title: React.ReactNode;
  /** Context, displayed to right of title */
  context?: React.ReactNode;
  /** Callback triggered when the artifact is resized */
  onChangeSize?: (props: { width: number; height?: number }) => void;
};

export default function HTMLArtifact(props: Props) {
  const { node, isEditable, onChangeSize, isSelected } = props;
  const ref = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [activeTab, setActiveTab] = React.useState<"preview" | "code">(
    "preview"
  );
  const [html, setHtml] = React.useState<string | null>(null);
  const [htmlError, setHtmlError] = React.useState(false);
  const title =
    typeof node.attrs.title === "string" ? node.attrs.title : "HTML artifact";
  const src = React.useMemo(
    () => getHtmlPreviewUrl(node.attrs.href),
    [node.attrs.href]
  );

  const { width, height, setSize, handlePointerDown, dragging } = useDragResize(
    {
      width: node.attrs.width ?? 720,
      height: node.attrs.height ?? 480,
      naturalWidth: 720,
      naturalHeight: 480,
      gridSnap: 5,
      gridHeightSnap: 20,
      minHeight: 240,
      onChangeSize,
      ref,
    }
  );

  React.useEffect(() => {
    if (
      (node.attrs.width && node.attrs.width !== width) ||
      (node.attrs.height && node.attrs.height !== height)
    ) {
      setSize({
        width: node.attrs.width ?? 720,
        height: node.attrs.height ?? 480,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.attrs.width, node.attrs.height]);

  const fetchHtml = React.useCallback(async () => {
    if (html !== null) {
      return html;
    }

    try {
      const res = await fetch(src, { credentials: "include" });
      const text = await res.text();
      setHtml(text);
      setHtmlError(false);
      return text;
    } catch (_err) {
      setHtmlError(true);
      return null;
    }
  }, [html, src]);

  const handleCodeTab = React.useCallback(() => {
    setActiveTab("code");
    void fetchHtml();
  }, [fetchHtml]);

  const handleCopy = React.useCallback(async () => {
    const text = await fetchHtml();
    if (!text) {
      toast.error("Could not copy HTML");
      return;
    }

    await navigator.clipboard.writeText(text);
    toast.success("HTML copied");
  }, [fetchHtml]);

  const handleOpen = React.useCallback(() => {
    window.open(src, "_blank", "noopener,noreferrer");
  }, [src]);

  const handleFrameLoad = React.useCallback(() => {
    const frame = iframeRef.current;
    if (!frame || dragging) {
      return;
    }

    try {
      const doc = frame.contentDocument;
      const nextHeight = doc?.documentElement?.scrollHeight;
      if (!nextHeight || !onChangeSize) {
        return;
      }

      const clamped = Math.max(240, Math.min(900, nextHeight + 12));
      if (Math.abs(clamped - height) > 40) {
        setSize({ width, height: clamped });
        onChangeSize({ width, height: clamped });
      }
    } catch (_err) {
      // Cross-origin previews cannot be measured. Manual resize remains available.
    }
  }, [dragging, height, onChangeSize, setSize, width]);

  return (
    <Wrapper
      contentEditable={false}
      ref={ref}
      className={
        isSelected || dragging
          ? "html-artifact-wrapper ProseMirror-selectednode"
          : "html-artifact-wrapper"
      }
      style={{ width: width || "100%" }}
      $dragging={dragging}
    >
      <ArtifactHeader>
        <Flex gap={6} align="center">
          {props.icon}
          <Preview>
            <Title>{props.title}</Title>
            <Subtitle>{props.context}</Subtitle>
          </Preview>
        </Flex>
        <Toolbar>
          <TabButton
            type="button"
            $active={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
          >
            <BrowserIcon size={14} />
            Preview
          </TabButton>
          <TabButton
            type="button"
            $active={activeTab === "code"}
            onClick={handleCodeTab}
          >
            <CodeIcon size={14} />
            Code
          </TabButton>
          <IconButton type="button" aria-label="Copy HTML" onClick={handleCopy}>
            <CopyIcon size={14} />
          </IconButton>
          <IconButton
            type="button"
            aria-label="Open in new tab"
            onClick={handleOpen}
          >
            <OpenIcon size={14} />
          </IconButton>
        </Toolbar>
      </ArtifactHeader>
      <SandboxNotice>
        <WarningIcon size={13} />
        Sandboxed HTML preview. Scripts, forms, popups, and downloads are
        isolated.
      </SandboxNotice>
      {activeTab === "preview" ? (
        <iframe
          ref={iframeRef}
          title={title}
          src={src}
          width="100%"
          height={height}
          sandbox="allow-scripts allow-forms allow-popups allow-downloads"
          referrerPolicy="no-referrer"
          onLoad={handleFrameLoad}
          style={{
            pointerEvents:
              !isEditable || (isSelected && !dragging) ? "initial" : "none",
          }}
        />
      ) : (
        <CodePanel style={{ height }}>
          {htmlError
            ? "Unable to load HTML source for this artifact."
            : (html ?? "Loading HTML...")}
        </CodePanel>
      )}
      {isEditable && !!props.onChangeSize && (
        <>
          <ResizeLeft
            onPointerDown={handlePointerDown("left")}
            $dragging={isSelected || dragging}
          />
          <ResizeRight
            onPointerDown={handlePointerDown("right")}
            $dragging={isSelected || dragging}
          />
          <ResizeBottom
            onPointerDown={handlePointerDown("bottom")}
            $dragging={isSelected || dragging}
          />
        </>
      )}
    </Wrapper>
  );
}

function getHtmlPreviewUrl(href: string) {
  const hashIndex = href.indexOf("#");
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex);
  const separator = base.includes("?") ? "&" : "?";

  return `${base}${separator}preview=html${hash}`;
}

const Wrapper = styled.div<{ $dragging: boolean }>`
  line-height: 0;
  position: relative;
  margin-left: auto;
  margin-right: auto;
  max-width: 100%;
  transition-property: width, height;
  transition-duration: 120ms;
  transition-timing-function: ease-in-out;
  overflow: hidden;
  will-change: ${(props) => (props.$dragging ? "width, height" : "auto")};
  box-shadow: 0 0 0 1px ${s("divider")};
  border-radius: ${EditorStyleHelper.blockRadius};
  padding: ${EditorStyleHelper.blockRadius};
  background: ${s("background")};

  iframe {
    display: block;
    margin-top: 6px;
    border: 0;
    border-radius: calc(${EditorStyleHelper.blockRadius} - 2px);
    background: #fff;
    transition-property: width, height;
    transition-duration: 120ms;
    transition-timing-function: ease-in-out;
    will-change: ${(props) => (props.$dragging ? "width, height" : "auto")};
  }

  &:hover {
    ${ResizeLeft}, ${ResizeRight}, ${ResizeBottom} {
      opacity: 1;
    }
  }
`;

const ArtifactHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  line-height: normal;
  min-width: 0;
`;

const Toolbar = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const TabButton = styled.button<{ $active: boolean }>`
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) =>
    props.$active ? props.theme.backgroundSecondary : "transparent"};
  color: ${(props) =>
    props.$active ? props.theme.text : props.theme.textSecondary};
  border-radius: 6px;
  height: 26px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

const IconButton = styled.button`
  border: 1px solid ${(props) => props.theme.divider};
  background: transparent;
  color: ${(props) => props.theme.textSecondary};
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

const SandboxNotice = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: ${(props) => props.theme.textTertiary};
  font-size: 12px;
  line-height: 18px;

  svg {
    color: ${(props) => props.theme.warning};
    flex-shrink: 0;
  }
`;

const CodePanel = styled.pre`
  margin: 6px 0 0;
  padding: 12px;
  overflow: auto;
  border-radius: calc(${EditorStyleHelper.blockRadius} - 2px);
  background: ${(props) => props.theme.backgroundSecondary};
  color: ${(props) => props.theme.text};
  border: 1px solid ${(props) => props.theme.divider};
  font-family: ${(props) => props.theme.fontFamilyMono};
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
`;
