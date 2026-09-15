import "server-only";
import { and, between, eq, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  personalFathomConnections,
  member,
  interviews,
  candidates,
  jobs,
  interviewRecordings,
} from "@harly/db";
import { decryptSecret } from "@/lib/crypto";
import {
  fathomMeetingSchema,
  matchFathomInterview,
  MATCH_WINDOW_MS,
  verifyFathomSignature,
} from "./webhook";

export async function importFathomWebhook(
  connectionId: string,
  raw: string,
  headers: Headers,
) {
  return db.transaction(async (tx) => {
    // Serializes imports against disconnect and secret replacement.
    const [connection] = await tx
      .select()
      .from(personalFathomConnections)
      .where(eq(personalFathomConnections.id, connectionId))
      .for("update");
    if (!connection?.secret) return "disabled" as const;
    const [membership] = await tx
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, connection.workspaceId),
          eq(member.userId, connection.userId),
          eq(member.status, "active"),
        ),
      )
      .for("share");
    if (!membership) return "disabled" as const;
    if (!verifyFathomSignature(raw, headers, decryptSecret(connection.secret)))
      return "unauthorized" as const;
    let parsed;
    try {
      parsed = fathomMeetingSchema.safeParse(JSON.parse(raw));
    } catch {
      return "invalid" as const;
    }
    if (!parsed.success) return "invalid" as const;
    const meeting = parsed.data;
    if (!meeting.scheduled_start_time || !meeting.meeting_url)
      return "ignored" as const;
    const start = new Date(meeting.scheduled_start_time).getTime();
    const rows = await tx
      .select({
        id: interviews.id,
        meetLink: interviews.meetLink,
        location: interviews.location,
        scheduledAt: interviews.scheduledAt,
        candidateEmail: candidates.email,
      })
      .from(interviews)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, interviews.candidateId),
          eq(candidates.workspaceId, connection.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, interviews.jobId),
          eq(jobs.workspaceId, connection.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(interviews.workspaceId, connection.workspaceId),
          eq(interviews.interviewerId, connection.userId),
          ne(interviews.status, "canceled"),
          between(
            interviews.scheduledAt,
            new Date(start - MATCH_WINDOW_MS),
            new Date(start + MATCH_WINDOW_MS),
          ),
        ),
      )
      .for("share", { of: [interviews, candidates, jobs] });
    const interviewId = matchFathomInterview(
      meeting,
      connection.recorderEmail,
      rows,
    );
    if (!interviewId) return "ignored" as const;
    const inserted = await tx
      .insert(interviewRecordings)
      .values({
        workspaceId: connection.workspaceId,
        interviewId,
        recordingId: String(meeting.recording_id),
        recordingUrl: meeting.url,
        summary: meeting.default_summary?.markdown_formatted ?? null,
        transcript:
          meeting.transcript?.map((line) => ({
            speaker: line.speaker.display_name,
            text: line.text,
            timestamp: line.timestamp,
          })) ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: interviewRecordings.id });
    if (!inserted.length) return "ignored" as const;
    await tx
      .update(personalFathomConnections)
      .set({
        lastImportedAt: sql`now()`,
        recorderEmail: meeting.recorded_by.email.toLowerCase(),
      })
      .where(eq(personalFathomConnections.id, connection.id));
    return "imported" as const;
  });
}
