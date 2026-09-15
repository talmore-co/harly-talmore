import "server-only";
import { z } from "zod";
import { safeFetchHttp } from "@/lib/ssrf";
import { fathomSecretSchema } from "./webhook";

export class FathomApiError extends Error {
  constructor(readonly status: number) {
    super(`Fathom request failed (${status}).`);
    this.name = "FathomApiError";
  }
}

export async function createFathomWebhook(apiKey: string, callbackUrl: string) {
  const response = await safeFetchHttp(
    "https://api.fathom.ai/external/v1/webhooks",
    {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        destination_url: callbackUrl,
        triggered_for: ["my_recordings", "my_shared_with_team_recordings"],
        include_summary: true,
        include_transcript: true,
        include_action_items: false,
        include_crm_matches: false,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new FathomApiError(response.status);
  return z
    .object({
      id: z.string().min(1).max(200),
      secret: fathomSecretSchema,
      url: z.literal(callbackUrl),
      include_summary: z.literal(true),
      include_transcript: z.literal(true),
      triggered_for: z
        .array(z.enum(["my_recordings", "my_shared_with_team_recordings"]))
        .min(1),
    })
    .parse(await response.json());
}

export async function deleteFathomWebhook(apiKey: string, webhookId: string) {
  const response = await safeFetchHttp(
    `https://api.fathom.ai/external/v1/webhooks/${encodeURIComponent(webhookId)}`,
    {
      method: "DELETE",
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok && response.status !== 404)
    throw new FathomApiError(response.status);
}
