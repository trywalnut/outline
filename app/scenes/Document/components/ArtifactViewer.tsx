import {
  BrowserIcon,
  CloseIcon,
  CodeIcon,
  EyeIcon,
  OpenIcon,
  RestoreIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import useKeyDown from "~/hooks/useKeyDown";
import type { ActiveArtifact } from "~/stores/UiStore";

type Tab = "preview" | "review" | "code";

type Props = {
  /** The artifact to render. */
  artifact: ActiveArtifact;
  /** Callback to close the viewer. */
  onClose: () => void;
};

/**
 * Full-height viewer that renders an HTML artifact in place of the document.
 * Provides interactive (sandboxed iframe), review (sanitized) and code views,
 * along with reload, open-in-new-tab and close controls.
 */
function ArtifactViewer({ artifact, onClose }: Props) {
  const { t } = useTranslation();
  const reviewRef = React.useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("preview");
  const [html, setHtml] = React.useState<string | null>(null);
  const [htmlError, setHtmlError] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const src = React.useMemo(
    () => getHtmlPreviewUrl(artifact.href),
    [artifact.href]
  );

  useKeyDown("Escape", onClose);

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

  const handlePreviewTab = React.useCallback(() => setActiveTab("preview"), []);

  const handleReviewTab = React.useCallback(() => {
    setActiveTab("review");
    void fetchHtml();
  }, [fetchHtml]);

  const handleCodeTab = React.useCallback(() => {
    setActiveTab("code");
    void fetchHtml();
  }, [fetchHtml]);

  const handleReload = React.useCallback(() => {
    setHtml(null);
    setHtmlError(false);
    setReloadKey((key) => key + 1);
  }, []);

  const handleOpen = React.useCallback(() => {
    window.open(src, "_blank", "noopener,noreferrer");
  }, [src]);

  React.useEffect(() => {
    if (activeTab !== "review" || html === null || !reviewRef.current) {
      return;
    }

    const root =
      reviewRef.current.shadowRoot ??
      reviewRef.current.attachShadow({ mode: "open" });
    root.replaceChildren(createReviewDocument(html));

    const handleClick = (event: Event) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a") : null;
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      event.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
    };

    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("click", handleClick);
    };
  }, [activeTab, html, reloadKey]);

  return (
    <Wrapper column>
      <ArtifactHeader>
        <HeaderTitle align="center" gap={8}>
          <BrowserIcon size={18} />
          <Title>{artifact.title}</Title>
        </HeaderTitle>
        <Toolbar>
          <TabGroup>
            <TabButton
              type="button"
              $active={activeTab === "preview"}
              onClick={handlePreviewTab}
            >
              <BrowserIcon size={16} />
              {t("Interactive")}
            </TabButton>
            <TabButton
              type="button"
              $active={activeTab === "review"}
              onClick={handleReviewTab}
            >
              <EyeIcon size={16} />
              {t("Review")}
            </TabButton>
            <TabButton
              type="button"
              $active={activeTab === "code"}
              onClick={handleCodeTab}
            >
              <CodeIcon size={16} />
              {t("Code")}
            </TabButton>
          </TabGroup>
          <Tooltip content={t("Reload")}>
            <NudeButton width={28} height={28} onClick={handleReload}>
              <RestoreIcon size={18} />
            </NudeButton>
          </Tooltip>
          <Tooltip content={t("Open in new tab")}>
            <NudeButton width={28} height={28} onClick={handleOpen}>
              <OpenIcon size={18} />
            </NudeButton>
          </Tooltip>
          <Tooltip content={t("Close")}>
            <NudeButton width={28} height={28} onClick={onClose}>
              <CloseIcon size={18} />
            </NudeButton>
          </Tooltip>
        </Toolbar>
      </ArtifactHeader>
      <Body>
        {activeTab === "preview" ? (
          <Frame
            key={reloadKey}
            title={artifact.title}
            src={src}
            sandbox="allow-scripts allow-forms allow-popups allow-downloads"
            referrerPolicy="no-referrer"
          />
        ) : activeTab === "review" ? (
          <ScrollPanel>
            {htmlError ? (
              <Message>{t("Unable to load HTML for review.")}</Message>
            ) : html === null ? (
              <Message>{t("Loading…")}</Message>
            ) : (
              <ReviewRoot ref={reviewRef} />
            )}
          </ScrollPanel>
        ) : (
          <CodePanel>
            {htmlError
              ? t("Unable to load HTML source for this artifact.")
              : (html ?? t("Loading…"))}
          </CodePanel>
        )}
      </Body>
    </Wrapper>
  );
}

function createReviewDocument(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  sanitizeReviewDocument(doc);

  const fragment = document.createDocumentFragment();
  const baseStyle = document.createElement("style");
  baseStyle.textContent = `
    :host {
      display: block;
      color: initial;
      background: #fff;
      font: initial;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      display: block;
      margin: 0;
      min-height: 100%;
      overflow-wrap: anywhere;
      user-select: text;
    }
    a {
      cursor: pointer;
    }
  `;
  fragment.appendChild(baseStyle);

  doc.head.querySelectorAll("style").forEach((style) => {
    const clone = document.createElement("style");
    clone.textContent = rewriteReviewCss(style.textContent ?? "");
    fragment.appendChild(clone);
  });

  const body = document.createElement("body");
  Array.from(doc.body.attributes).forEach((attr) => {
    body.setAttribute(attr.name, attr.value);
  });
  doc.body.childNodes.forEach((child) => {
    body.appendChild(document.importNode(child, true));
  });
  fragment.appendChild(body);

  return fragment;
}

function sanitizeReviewDocument(doc: Document) {
  doc
    .querySelectorAll("script, iframe, object, embed, base, form")
    .forEach((element) => element.remove());

  doc.querySelectorAll("style").forEach((style) => {
    style.textContent = rewriteReviewCss(style.textContent ?? "");
  });

  doc.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        name === "autofocus" ||
        ((name === "href" || name === "src" || name === "xlink:href") &&
          /^(javascript|vbscript):/i.test(value))
      ) {
        element.removeAttribute(attr.name);
      }
    });

    if (element instanceof HTMLAnchorElement) {
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  });
}

function rewriteReviewCss(css: string) {
  return css
    .replace(/:root/g, ":host, body")
    .replace(/(^|[,{]\s*)html(?=[\s.#:[,{>+~])/g, "$1:host")
    .replace(/(^|[,{]\s*)body(?=[\s.#:[,{>+~])/g, "$1body");
}

function getHtmlPreviewUrl(href: string) {
  const hashIndex = href.indexOf("#");
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex);
  const separator = base.includes("?") ? "&" : "?";

  return `${base}${separator}preview=html${hash}`;
}

const Wrapper = styled(Flex)`
  height: 100%;
  width: 100%;
  background: ${s("background")};
`;

const ArtifactHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid ${s("divider")};
  flex-shrink: 0;
`;

const HeaderTitle = styled(Flex)`
  min-width: 0;
  color: ${s("text")};
`;

const Title = styled.span`
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Toolbar = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  color: ${s("textSecondary")};
`;

const TabGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 4px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) =>
    props.$active ? props.theme.backgroundSecondary : "transparent"};
  color: ${(props) =>
    props.$active ? props.theme.text : props.theme.textSecondary};
  border-radius: 6px;
  height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

const Body = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
`;

const Frame = styled.iframe`
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
`;

const ScrollPanel = styled.div`
  flex: 1;
  overflow: auto;
  background: #fff;
`;

const ReviewRoot = styled.div`
  min-height: 100%;
`;

const CodePanel = styled.pre`
  flex: 1;
  margin: 0;
  padding: 16px;
  overflow: auto;
  background: ${(props) => props.theme.backgroundSecondary};
  color: ${(props) => props.theme.text};
  font-family: ${(props) => props.theme.fontFamilyMono};
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
`;

const Message = styled.div`
  padding: 16px;
  color: ${(props) => props.theme.textSecondary};
  font-size: 13px;
`;

export default ArtifactViewer;
