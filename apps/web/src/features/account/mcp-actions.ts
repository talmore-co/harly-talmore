"use server";
import { and, eq } from "drizzle-orm";
import {
  db,
  oauthConsent,
  oauthClient,
  oauthAccessToken,
  oauthRefreshToken,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { revalidatePath } from "next/cache";
import { withMcpOAuthLock, removePendingMcpCodes } from "@harly/auth/mcp-oauth";

export async function listMyMcpConnections() {
  const { user, organization } = await getWorkspaceContext();
  return db
    .select({
      id: oauthConsent.id,
      name: oauthClient.name,
      scopes: oauthConsent.scopes,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(
      and(
        eq(oauthConsent.userId, user.id),
        eq(oauthConsent.referenceId, organization.id),
      ),
    );
}

export async function revokeMyMcpConnection(id: string) {
  const { user, organization } = await getWorkspaceContext();
  await withMcpOAuthLock(() =>
    db.transaction(async (tx) => {
      const [consent] = await tx
        .select()
        .from(oauthConsent)
        .where(
          and(
            eq(oauthConsent.id, id),
            eq(oauthConsent.userId, user.id),
            eq(oauthConsent.referenceId, organization.id),
          ),
        )
        .for("update");
      if (!consent) return;
      await removePendingMcpCodes(user.id, consent.clientId, organization.id);
      await tx
        .delete(oauthAccessToken)
        .where(
          and(
            eq(oauthAccessToken.userId, user.id),
            eq(oauthAccessToken.clientId, consent.clientId),
            eq(oauthAccessToken.referenceId, organization.id),
          ),
        );
      await tx
        .delete(oauthRefreshToken)
        .where(
          and(
            eq(oauthRefreshToken.userId, user.id),
            eq(oauthRefreshToken.clientId, consent.clientId),
            eq(oauthRefreshToken.referenceId, organization.id),
          ),
        );
      await tx.delete(oauthConsent).where(eq(oauthConsent.id, consent.id));
    }),
  );
  revalidatePath("/account");
}
