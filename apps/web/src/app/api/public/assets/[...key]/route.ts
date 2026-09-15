import { getPublicAssetStorage, isPublicAssetKey } from "@/lib/public-assets";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await params;
  const key = `public-assets/${parts.join("/")}`;
  if (parts.length !== 2 || !isPublicAssetKey(key)) return new Response("Not found", { status: 404 });

  try {
    const bytes = await getPublicAssetStorage().read(key);
    const type = key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
