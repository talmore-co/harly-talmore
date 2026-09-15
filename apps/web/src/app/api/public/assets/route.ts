import sharp from "sharp";
import { NextResponse } from "next/server";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getImageFileValidationError, maxImageFileSize } from "@/lib/storage-validation";
import { createPublicAssetKey, getPublicAssetStorage, publicAssetUrl } from "@/lib/public-assets";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== getHarlyPublicOrigin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let workspaceId: string;
  try {
    const context = await requirePermission("settings:edit");
    workspaceId = context.organization.id;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Bound the body before parsing multipart data, including chunked requests.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Image is required." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxImageFileSize + 64 * 1024) {
      await reader.cancel();
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 413 });
    }
    chunks.push(value);
  }

  let image: Buffer;
  try {
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Image is required.");
    const error = getImageFileValidationError(file);
    if (error) throw new Error(error);
    // Decode and re-encode SVG/raster uploads; never serve active SVG/HTML on our origin.
    image = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    if (image.length > maxImageFileSize) throw new Error("Converted image must be 5MB or smaller.");
  } catch {
    return NextResponse.json({ error: "Upload a valid PNG, JPG, SVG or WEBP image up to 5MB." }, { status: 400 });
  }

  try {
    const key = createPublicAssetKey(workspaceId);
    await getPublicAssetStorage().put(key, image, "image/png");
    return NextResponse.json({ fileUrl: publicAssetUrl(key) });
  } catch {
    return NextResponse.json({ error: "Public image storage is unavailable. Check the assets bucket configuration." }, { status: 503 });
  }
}
