import { isPublicAssetKey } from "@/lib/public-assets";
import { readPublicImage } from "@/lib/public-image.server";
import { publicImageWidths } from "@/lib/public-image";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await params;
  const key = `public-assets/${parts.join("/")}`;
  if (parts.length !== 2 || !isPublicAssetKey(key)) return new Response("Not found", { status: 404 });
  const rawWidth = new URL(request.url).searchParams.get("w");
  const width = rawWidth === null ? undefined : Number(rawWidth);
  if (width !== undefined && !publicImageWidths.some(size => String(size) === rawWidth)) return new Response("Invalid image size", { status: 400 });

  try {
    const { bytes, type } = await readPublicImage(key, width);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
