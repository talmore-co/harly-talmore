import "server-only";
import sanitizeHtml from "sanitize-html";

/** Allow rich editor content while keeping executable markup out of server HTML. */
export function sanitizeRichHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "iframe", "video", "source"],
    allowedAttributes: {
      "*": ["class", "style"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      iframe: ["src", "title", "width", "height", "allowfullscreen", "loading", "sandbox"],
      video: ["src", "poster", "width", "height", "controls", "muted", "loop", "playsinline", "preload"],
      source: ["src", "type"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "http"], iframe: ["https"], video: ["https", "http"], source: ["https", "http"] },
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,]+\)$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy", decoding: "async" }),
      iframe: sanitizeHtml.simpleTransform("iframe", { loading: "lazy", sandbox: "allow-scripts allow-presentation" }),
      video: sanitizeHtml.simpleTransform("video", { preload: "none" }),
    },
  });
}
