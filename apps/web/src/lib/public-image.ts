/** Finite sizes keep public image transformations bounded and cacheable. */
export const publicImageWidths = [160, 320, 480, 768, 1200, 1600, 2048] as const;
const assetPath = /^\/api\/public\/assets\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

export function publicImageSource(src: string, width: number) {
  try {
    const url = new URL(src, "https://relative.invalid");
    if (!assetPath.test(url.pathname) || !publicImageWidths.some(size => size === width)) return src;
    url.searchParams.set("w", String(width));
    url.searchParams.set("v", "1");
    return src.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  } catch { return src; }
}

export function publicImageSrcSet(src: string, maxWidth = 2048) {
  if (publicImageSource(src, 160) === src) return undefined;
  return publicImageWidths.filter(width => width <= maxWidth).map(width => `${publicImageSource(src, width)} ${width}w`).join(", ");
}
