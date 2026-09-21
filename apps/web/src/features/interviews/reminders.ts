import "server-only";

import { and, eq, gt, gte, isNull, lte, notExists, sql } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  emailOutbox,
  interviews,
  jobs,
  workspaceSettings,
} from "@harly/db";
import { z } from "zod";
import {
  renderWorkflowText,
  workflowTextHtml,
} from "@/features/automations/message-template";
import {
  storedInterviewReminderSettingsSchema,
  type StoredInterviewReminderSettings,
} from "./reminder-settings";

const reminderPayloadSchema = z.object({
  interviewId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  revision: z.string().uuid(),
});

export async function getInterviewReminderSettings(workspaceId: string) {
  const [row] = await db
    .select({ config: workspaceSettings.interviewReminders })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId));
  const parsed = storedInterviewReminderSettingsSchema.safeParse(row?.config);
  return parsed.success ? parsed.data : null;
}

async function eligibleInterview(
  workspaceId: string,
  interviewId: string,
  now: Date,
) {
  const [row] = await db
    .select({ interview: interviews, candidate: candidates, job: jobs })
    .from(interviews)
    .innerJoin(
      applications,
      and(
        eq(applications.id, interviews.applicationId),
        eq(applications.workspaceId, workspaceId),
        eq(applications.status, "active"),
      ),
    )
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
        isNull(candidates.anonymizedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspaceId),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(interviews.workspaceId, workspaceId),
        eq(interviews.id, interviewId),
        eq(interviews.status, "scheduled"),
        gt(interviews.scheduledAt, now),
      ),
    );
  return row ?? null;
}

function managedByCal(source: string | null) {
  return source === "cal.com-personal" || source === "cal.com";
}

/** Used again at delivery, so queued mail cannot outlive the schedule or settings. */
export async function prepareInterviewReminder(
  workspaceId: string,
  payload: unknown,
  now = new Date(),
) {
  const parsed = reminderPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const config = await getInterviewReminderSettings(workspaceId);
  if (!config?.settings.enabled || config.revision !== parsed.data.revision)
    return null;
  const row = await eligibleInterview(
    workspaceId,
    parsed.data.interviewId,
    now,
  );
  if (
    !row ||
    row.interview.scheduledAt.toISOString() !== parsed.data.scheduledAt ||
    (managedByCal(row.interview.source) &&
      config.settings.calReminders !== "talmore")
  )
    return null;
  const dueAt =
    row.interview.scheduledAt.getTime() - config.settings.hoursBefore * 3600000;
  if (
    dueAt < Date.parse(config.savedAt) ||
    dueAt > now.getTime() ||
    dueAt < now.getTime() - 3600000
  )
    return null;
  const when = new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: config.settings.timeZone,
  }).format(row.interview.scheduledAt);
  const context = {
    candidate: {
      firstName: row.candidate.firstName,
      lastName: row.candidate.lastName,
    },
    job: { title: row.job.title },
    interview: {
      when: `${when} (${config.settings.timeZone})`,
      location:
        row.interview.meetLink ||
        row.interview.location ||
        "See your original interview invitation",
    },
  };
  const subject = renderWorkflowText(config.settings.subject, context);
  const text = renderWorkflowText(config.settings.body, context);
  return {
    to: row.candidate.email,
    candidateId: row.candidate.id,
    applicationId: row.interview.applicationId,
    subject,
    text,
    bodyHtml: workflowTextHtml(text),
  };
}

export async function dispatchInterviewReminders(now = new Date()) {
  const rows = await db
    .select({
      workspaceId: workspaceSettings.organizationId,
      config: workspaceSettings.interviewReminders,
    })
    .from(workspaceSettings)
    .where(
      sql`${workspaceSettings.interviewReminders}->'settings'->>'enabled' = 'true'`,
    );
  let queued = 0;
  for (const row of rows) {
    const parsed = storedInterviewReminderSettingsSchema.safeParse(row.config);
    if (!parsed.success) continue;
    queued += await queueWorkspaceReminders(row.workspaceId, parsed.data, now);
  }
  return { queued };
}

async function queueWorkspaceReminders(
  workspaceId: string,
  config: StoredInterviewReminderSettings,
  now: Date,
) {
  const offset = config.settings.hoursBefore * 3600000;
  const lower = Math.max(now.getTime() - 3600000, Date.parse(config.savedAt));
  const key = sql<string>`concat('interview-reminder:', ${interviews.id}, ':', floor(extract(epoch from ${interviews.scheduledAt}) * 1000)::bigint)`;
  const upcoming = await db
    .select({ id: interviews.id, scheduledAt: interviews.scheduledAt })
    .from(interviews)
    .where(
      and(
        eq(interviews.workspaceId, workspaceId),
        eq(interviews.status, "scheduled"),
        config.settings.calReminders === "provider"
          ? sql`coalesce(${interviews.source}, '') not in ('cal.com', 'cal.com-personal')`
          : undefined,
        gt(interviews.scheduledAt, now),
        gte(interviews.scheduledAt, new Date(lower + offset)),
        lte(interviews.scheduledAt, new Date(now.getTime() + offset)),
        notExists(
          db
            .select({ id: emailOutbox.id })
            .from(emailOutbox)
            .where(
              and(
                eq(emailOutbox.workspaceId, workspaceId),
                eq(emailOutbox.dedupeKey, key),
              ),
            ),
        ),
      ),
    )
    .orderBy(interviews.scheduledAt)
    .limit(200);
  const { enqueueEmailOutbox } = await import("@/lib/email/outbox-processor");
  let queued = 0;
  for (const interview of upcoming) {
    const payload = {
      interviewId: interview.id,
      scheduledAt: interview.scheduledAt.toISOString(),
      revision: config.revision,
    };
    if (!(await prepareInterviewReminder(workspaceId, payload, now))) continue;
    // Changing the copy, toggling the setting or repeated scheduler ticks cannot
    // send a second reminder for the same interview time.
    await enqueueEmailOutbox(
      workspaceId,
      "interview.reminder",
      payload,
      `interview-reminder:${interview.id}:${interview.scheduledAt.getTime()}`,
    );
    queued++;
  }
  return queued;
}
