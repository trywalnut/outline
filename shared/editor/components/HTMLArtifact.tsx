import * as React from "react";
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
  const title =
    typeof node.attrs.title === "string" ? node.attrs.title : "HTML artifact";
  const src = React.useMemo(() => getHtmlPreviewUrl(node.attrs.href), [
    node.attrs.href,
  ]);

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
      <Flex gap={6} align="center">
        {props.icon}
        <Preview>
          <Title>{props.title}</Title>
          <Subtitle>{props.context}</Subtitle>
        </Preview>
      </Flex>
      <iframe
        title={title}
        src={src}
        width="100%"
        height={height}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        referrerPolicy="no-referrer"
        style={{
          pointerEvents:
            !isEditable || (isSelected && !dragging) ? "initial" : "none",
        }}
      />
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
