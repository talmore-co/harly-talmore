"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DESIGN_WIDTH = { desktop: 1280, mobile: 390 } as const;
const DOCUMENT =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="preview-root"></div></body></html>';

/** An actual viewport is required: narrowing a div does not change media queries. */
export function PreviewFrame({
  device,
  background,
  children,
}: {
  device: "desktop" | "mobile";
  background: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [size, setSize] = useState({ scale: 1, height: 800 });
  const designWidth = DESIGN_WIDTH[device];

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () =>
      setSize({
        scale: Math.min(
          1,
          container.clientWidth / designWidth,
          device === "mobile" ? container.clientHeight / 844 : 1,
        ),
        height: container.clientHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [designWidth, device]);

  useLayoutEffect(() => {
    const previewDocument = iframeRef.current?.contentDocument;
    if (!previewDocument) return;
    // Copy styles, not app scripts. Keep Tailwind/HMR and loaded fonts in sync.
    const copies = new Map<
      Element,
      { clone: HTMLElement; signature: string }
    >();
    const syncStyles = () => {
      const sources = Array.from(
        document.head.querySelectorAll('style, link[rel="stylesheet"]'),
      ).filter(
        (node) =>
          !/data-scroll-locked|with-scroll-bars-hidden/.test(
            node.textContent ?? "",
          ),
      );
      const active = new Set(sources);
      for (const [source, copy] of copies) {
        if (!active.has(source)) {
          copy.clone.remove();
          copies.delete(source);
        }
      }
      sources.forEach((node) => {
        const signature = node.outerHTML;
        const existing = copies.get(node);
        if (existing?.signature === signature) return;
        const clone = node.cloneNode(true) as HTMLElement;
        clone.setAttribute("data-preview-style", "");
        if (existing) existing.clone.replaceWith(clone);
        else previewDocument.head.appendChild(clone);
        copies.set(node, { clone, signature });
      });
      previewDocument.documentElement.className =
        document.documentElement.className;
      previewDocument.documentElement.style.cssText =
        document.documentElement.style.cssText;
      previewDocument.body.className = document.body.className;
      previewDocument.body.style.margin = "0";
      previewDocument.body.style.background = background;
    };
    syncStyles();
    const observer = new MutationObserver(syncStyles);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      observer.disconnect();
      copies.forEach(({ clone }) => clone.remove());
    };
  }, [frameDocument, background]);

  const root = frameDocument?.getElementById("preview-root");
  const viewportHeight =
    device === "mobile" ? 844 : size.height / (size.scale || 1);
  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <div
        className="mx-auto overflow-hidden rounded-xl border border-border shadow-lg"
        style={{
          width: designWidth * size.scale,
          height: viewportHeight * size.scale,
          background,
        }}
      >
        <iframe
          ref={iframeRef}
          title={`${device} page preview`}
          srcDoc={DOCUMENT}
          sandbox="allow-same-origin"
          onLoad={(event) =>
            setFrameDocument(event.currentTarget.contentDocument)
          }
          className="block border-0"
          style={{
            width: designWidth,
            height: viewportHeight,
            transform: `scale(${size.scale})`,
            transformOrigin: "top left",
            background,
          }}
        />
        {root ? createPortal(children, root) : null}
      </div>
    </div>
  );
}
