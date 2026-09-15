import { getWorkspaceContext } from "@/features/workspaces/context";
import { db, oauthClient } from "@harly/db";
import { eq } from "drizzle-orm";
import { McpConsentForm } from "@/features/account/McpConsentForm";

export default async function McpConsent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getWorkspaceContext();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, item);
  const clientId = query.get("client_id");
  const [client] = clientId
    ? await db
        .select({
          name: oauthClient.name,
          redirectUris: oauthClient.redirectUris,
        })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, clientId))
    : [];
  if (!client)
    return (
      <main className="p-8">
        This connection request is invalid. Start again from your assistant.
      </main>
    );
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">
        Connect {client.name || "AI assistant"} to Harly?
      </h1>
      <p className="text-sm text-muted-foreground">
        Authorizing as {context.user.email} for {context.organization.name}.
        Your current Harly permissions apply.
      </p>
      <McpConsentForm
        query={query.toString()}
        scopes={(query.get("scope") ?? "").split(" ")}
      />
    </main>
  );
}
