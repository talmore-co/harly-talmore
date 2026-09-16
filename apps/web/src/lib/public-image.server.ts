import "server-only";
import sharp from "sharp";
import { getPublicAssetStorage, isPublicAssetKey } from "./public-assets";
import { publicImageWidths } from "./public-image";

export async function readPublicImage(key: string, width?: number) {
  if (!isPublicAssetKey(key)) throw new Error("Invalid asset key");
  const storage = getPublicAssetStorage();
  if (width === undefined) return { bytes: await storage.read(key), type: key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp" };
  if (!publicImageWidths.some(size => size === width)) throw new Error("Invalid image size");
  const variantKey = key.replace("public-assets/", "public-asset-variants/v1/").replace(/\.(png|jpg|webp)$/, `-${width}.webp`);
  try { return { bytes: await storage.read(variantKey), type: "image/webp" }; } catch { /* First request generates the persistent variant. */ }
  const original = await storage.read(key);
  const bytes = await sharp(original, { limitInputPixels: 40_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 100, effort: 4 }).toBuffer();
  // A read-only storage outage must not prevent displaying an existing image.
  try { await storage.put(variantKey, bytes, "image/webp"); } catch { /* Serve the generated image; a later request may cache it. */ }
  return { bytes, type: "image/webp" };
}
