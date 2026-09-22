import "server-only";
import { z } from "zod";

const id = z.string().min(1).max(256);
const text = z.string().max(100_000).optional();
export const connectionSchema = z.object({
  organization: z.object({ id, name: z.string() }),
  scopes: z.array(z.string()),
});
export const resourceSchema = z.object({ id, name: z.string().optional(), title: z.string().optional(), projectId: id.optional() });
export const sourceCandidateSchema = z.object({
  candidateId: id,
  organizationId: id,
  projectId: id,
  sourceShortlistId: id.optional(),
  fullName: text,
  replyDisposition: z.enum(["unknown", "interested", "not_interested", "neutral"]).optional(),
  replyDispositionSource: z.enum(["manual", "ai"]).optional(),
  replyDispositionUpdatedAt: z.number().optional(),
  notes: text,
});
const date = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31).optional() }).optional();
export const exportSchema = z.object({
  candidateId: id,
  organizationId: id,
  profile: z.object({
    fullName: text, firstName: text, lastName: text, headline: text, title: text,
    currentEmployer: text, location: text, linkedinUrl: text, summary: text,
    skills: z.array(z.string()).max(500).optional(),
    employmentHistory: z.array(z.object({ company: text, title: text, description: text, location: text, startsAt: date, endsAt: date, isCurrent: z.boolean().optional() })).max(200).optional(),
    education: z.array(z.object({ school: text, degreeName: text, fieldOfStudy: text, description: text, startsAt: date, endsAt: date })).max(200).optional(),
  }),
  contacts: z.object({ selectedEmail: text, primaryPhone: text }),
  privateContext: z.object({ notes: text, resumeData: text }),
});
export type SourceCandidate = z.infer<typeof sourceCandidateSchema>;
export type ExportedCandidate = z.infer<typeof exportSchema>;

export class TalentSourcerError extends Error {}

export function missingImportScopes(scopes: string[]) {
  return [["projects:read"], ["shortlists:read", "candidates:read"], ["campaigns:read", "shortlists:read"], ["candidates:read", "ats:read"]]
    .filter(group => !group.some(scope => scopes.includes(scope)))
    .map(group => group.join(" or "));
}

/** Only the fixed provider origin receives the workspace credential. */
export async function sourceRequest<T>(token: string, path: string, schema: z.ZodType<T>): Promise<T> {
  try {
    const response = await fetch(`https://api.talentsourcer.ai/api/v1/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const message = response.status === 401 ? "Reconnect TalentSourcer: the token is invalid or revoked."
        : response.status === 403 ? "The TalentSourcer token cannot access this resource. Check its permissions."
        : response.status === 404 ? "This TalentSourcer resource is unavailable. Confirm the integration API has been deployed."
        : response.status === 429 ? "TalentSourcer is rate limiting requests. Try again shortly."
        : "TalentSourcer could not complete this request. Please try again.";
      throw new TalentSourcerError(message);
    }
    const body = await response.text();
    if (body.length > 5_000_000) throw new TalentSourcerError("TalentSourcer returned too much data. Choose a smaller source.");
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success) throw new TalentSourcerError("TalentSourcer returned an incompatible response. Check the integration API version.");
    return parsed.data;
  } catch (error) {
    if (error instanceof TalentSourcerError) throw error;
    throw new TalentSourcerError("Could not reach TalentSourcer. Please try again.");
  }
}

export async function sourcePage<T>(token: string, path: string, schema: z.ZodType<T>, cursor?: string) {
  const separator = path.includes("?") ? "&" : "?";
  return sourceRequest(token, `${path}${separator}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    z.object({ page: z.array(schema), continueCursor: z.string(), isDone: z.boolean() }));
}

export async function sourceResources(token: string, path: string) {
  const rows: z.infer<typeof resourceSchema>[] = [];
  const resource = z.enum(["projects", "shortlists", "campaigns"]).parse(path.split("?")[0]);
  const envelope = z.object({ projects: z.array(resourceSchema).optional(), shortlists: z.array(resourceSchema).optional(), campaigns: z.array(resourceSchema).optional(), continueCursor: z.string(), isDone: z.boolean() }).refine(value => value[resource] !== undefined);
  let cursor: string | undefined;
  for (let page = 0; page < 40; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const result = await sourceRequest(token, `${path}${separator}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, envelope);
    rows.push(...result[resource]!);
    if (result.isDone) return rows;
    if (!result.continueCursor || result.continueCursor === cursor) break;
    cursor = result.continueCursor;
  }
  throw new TalentSourcerError("Too many TalentSourcer sources to load. Narrow the project selection.");
}
