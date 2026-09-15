import "server-only";

import { randomUUID } from "node:crypto";
import { createStorage } from "@harly/storage";
import { getHarlyPublicOrigin, toHarlyPublicUrl } from "@/lib/public-origin";

// Only server-created raster assets live here. Never accept generic storage keys.
const assetKeyPattern = /^public-assets\/[A-Za-z0-9_-]{1,128}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
const routePrefix = "/api/public/assets/";

export function isPublicAssetKey(key: string): boolean {
  return assetKeyPattern.test(key);
}

export function createPublicAssetKey(workspaceId: string, extension = "png"): string {
  const key = `public-assets/${workspaceId}/${randomUUID()}.${extension}`;
  if (!isPublicAssetKey(key)) throw new Error("Invalid public asset key.");
  return key;
}

export function publicAssetUrl(key: string): string {
  if (!isPublicAssetKey(key)) throw new Error("Invalid public asset key.");
  return toHarlyPublicUrl(`${routePrefix}${key.slice("public-assets/".length)}`);
}

export function publicAssetKeyFromUrl(value: string): string | null {
  try {
    const url = new URL(value, getHarlyPublicOrigin());
    if (url.origin !== getHarlyPublicOrigin() || url.search || url.hash || !url.pathname.startsWith(routePrefix)) return null;
    const key = `public-assets/${url.pathname.slice(routePrefix.length)}`;
    return isPublicAssetKey(key) ? key : null;
  } catch {
    return null;
  }
}

export function getPublicAssetStorage() {
  if (process.env.STORAGE_PROVIDER !== "s3") return createStorage({ provider: "local" });

  const bucket = process.env.ASSETS_S3_BUCKET;
  if (!bucket || bucket === process.env.S3_BUCKET) {
    throw new Error("Set ASSETS_S3_BUCKET to a separate private bucket for public images.");
  }
  const accessKeyId = process.env.ASSETS_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.ASSETS_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error("Public asset storage credentials are missing.");
  return createStorage({
    provider: "s3",
    bucket,
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
  });
}
