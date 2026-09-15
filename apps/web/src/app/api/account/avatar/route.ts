import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db, member, user } from "@harly/db";
import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { storage } from "@/lib/storage";
import { accountAvatarKey } from "@/lib/account-avatar";
import { maxImageFileSize } from "@/lib/storage-validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const missing = () => new NextResponse("Not found", { status: 404 });
  const key = request.nextUrl.searchParams.get("key");
  if (!key || accountAvatarKey(key) !== key) return missing();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return missing();
  const workspaceId = key.split("/")[1]!;
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, workspaceId),
      ),
    )
    .limit(1);
  if (!membership) return missing();

  // Use persisted references, not a client-supplied URL or stale session image.
  const [own] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  let allowed = Boolean(own?.image && accountAvatarKey(own.image) === key);
  if (!allowed) {
    const context = await getWorkspaceContextOrNull();
    if (!context || context.organization.id !== workspaceId) return missing();
    const teammates = await db
      .select({ image: user.image })
      .from(user)
      .innerJoin(
        member,
        and(
          eq(member.userId, user.id),
          eq(member.organizationId, context.organization.id),
        ),
      );
    allowed = teammates.some(
      (row) => row.image && accountAvatarKey(row.image) === key,
    );
  }
  if (!allowed) return missing();
  try {
    const bytes = await storage.read(key);
    if (bytes.length > maxImageFileSize) return missing();
    const image = await sharp(bytes, { limitInputPixels: 16_000_000 })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return missing();
  }
}
