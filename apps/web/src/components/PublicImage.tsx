import type { ImgHTMLAttributes } from "react";
import { publicImageSource, publicImageSrcSet } from "@/lib/public-image";

/** Native responsive image; uploaded public assets use persistent WebP variants. */
export function PublicImage({ src, alt, sizes = "100vw", priority = false, maxWidth = 2048, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & { src: string; alt: string; priority?: boolean; maxWidth?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} src={publicImageSource(src, maxWidth)} srcSet={publicImageSrcSet(src, maxWidth)} sizes={sizes} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />;
}
