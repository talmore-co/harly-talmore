import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  emailOutbox,
  interviews,
  jobs,
  jobStages,
  organization,
  workspaceSettings,
  user,
} from "@harly/db";

const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: auth.requirePermission,
}));
import {
  dispatchInterviewReminders,
  getInterviewReminderSettings,
  prepareInterviewReminder,
} from "./reminders";
import { DEFAULT_INTERVIEW_REMINDER } from "./reminder-settings";
import { saveInterviewReminderSettings } from "./reminder-settings-actions";

const integration =
  process.env.RUN_INTERVIEW_REMINDERS_INTEGRATION === "1"
    ? describe
    : describe.skip;
integration("workspace interview reminders", () => {
  let workspaceId: string,
    actorId: string,
    candidateId: string,
    applicationId: string,
    jobId: string,
    stageId: string,
    interviewId: string,
    now: Date,
    revision: string,
    scheduledAt: Date;
  const rows = () =>
    db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.workspaceId, workspaceId));
  async function configure(
    patch:
      | Partial<typeof DEFAULT_INTERVIEW_REMINDER>
      | { calReminders: "talmore" } = {},
    savedAt = new Date(now.getTime() - 7200000),
  ) {
    const config = {
      settings: {
        ...DEFAULT_INTERVIEW_REMINDER,
        enabled: true,
        timeZone: "Asia/Manila",
        ...patch,
      },
      revision,
      savedAt: savedAt.toISOString(),
    };
    await db
      .insert(workspaceSettings)
      .values({ organizationId: workspaceId, interviewReminders: config })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { interviewReminders: config },
      });
  }
  beforeEach(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/harly_talmore_eval"
    )
      throw new Error("Use local evaluation DB");
    workspaceId = randomUUID();
    actorId = randomUUID();
    candidateId = randomUUID();
    applicationId = randomUUID();
    jobId = randomUUID();
    stageId = randomUUID();
    interviewId = randomUUID();
    revision = randomUUID();
    now = new Date();
    scheduledAt = new Date(now.getTime() + 24 * 3600000 - 60000);
    auth.requirePermission.mockReset();
    auth.requirePermission.mockResolvedValue({
      organization: { id: workspaceId },
    });
    await db.insert(user).values({ id: actorId, name: "Fictional reminder admin", email: `${actorId}@example.test` });
    await db
      .insert(organization)
      .values({
        id: workspaceId,
        slug: workspaceId,
        name: "Fictional reminder workspace",
        createdAt: now,
      });
    await db
      .insert(candidates)
      .values({
        id: candidateId,
        workspaceId,
        firstName: "<Fictional>",
        lastName: "Candidate",
        email: `${candidateId}@example.test`,
      });
    await db
      .insert(jobs)
      .values({
        id: jobId,
        workspaceId,
        title: "Fictional role",
        slug: jobId,
        status: "open",
        employmentType: "full_time",
        workplaceType: "onsite",
        description: "Fixture",
        createdById: actorId,
      });
    await db
      .insert(jobStages)
      .values({ id: stageId, workspaceId, jobId, name: "Interview", order: 0 });
    await db
      .insert(applications)
      .values({
        id: applicationId,
        workspaceId,
        candidateId,
        jobId,
        currentStageId: stageId,
      });
    await db
      .insert(interviews)
      .values({
        id: interviewId,
        workspaceId,
        applicationId,
        candidateId,
        jobId,
        scheduledAt,
        durationMins: 30,
        type: "screening",
        mode: "video",
        status: "scheduled",
        meetLink: "https://meet.example.test/fictional",
      });
  });
  afterEach(async () => {
    if (workspaceId)
      await db.delete(organization).where(eq(organization.id, workspaceId));
    if (actorId) await db.delete(user).where(eq(user.id, actorId));
  });

  it("is off by default and queues one system reminder without a workflow", async () => {
    await dispatchInterviewReminders(now);
    expect(await rows()).toHaveLength(0);
    await configure();
    await dispatchInterviewReminders(now);
    await dispatchInterviewReminders(now);
    const queued = await rows();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.kind).toBe("interview.reminder");
    expect(queued[0]!.actorId).toBeNull();
    const message = await prepareInterviewReminder(
      workspaceId,
      queued[0]!.payload,
      now,
    );
    expect(message?.text).toContain("Asia/Manila");
    expect(message?.bodyHtml).toContain("&lt;Fictional&gt;");
    expect(message?.applicationId).toBe(applicationId);
    expect(
      await prepareInterviewReminder(randomUUID(), queued[0]!.payload, now),
    ).toBeNull();
  });
  it("suppresses a stale time after rescheduling and queues the new time when due", async () => {
    await configure();
    await dispatchInterviewReminders(now);
    const [old] = await rows();
    const nextTime = new Date(scheduledAt.getTime() + 24 * 3600000);
    await db
      .update(interviews)
      .set({ scheduledAt: nextTime })
      .where(eq(interviews.id, interviewId));
    expect(
      await prepareInterviewReminder(workspaceId, old!.payload, now),
    ).toBeNull();
    await dispatchInterviewReminders(new Date(now.getTime() + 24 * 3600000));
    const queued = await rows();
    expect(queued).toHaveLength(2);
    const next = queued.find((row) => row.id !== old!.id)!;
    expect(
      await prepareInterviewReminder(
        workspaceId,
        next.payload,
        new Date(now.getTime() + 24 * 3600000),
      ),
    ).not.toBeNull();
  });
  it("cancels queued mail after cancellation, rejection, start time or settings changes", async () => {
    await configure();
    await dispatchInterviewReminders(now);
    const [queued] = await rows();
    await db
      .update(interviews)
      .set({ status: "canceled" })
      .where(eq(interviews.id, interviewId));
    expect(
      await prepareInterviewReminder(workspaceId, queued!.payload, now),
    ).toBeNull();
    await db
      .update(interviews)
      .set({ status: "scheduled" })
      .where(eq(interviews.id, interviewId));
    await db
      .update(applications)
      .set({ status: "rejected" })
      .where(eq(applications.id, applicationId));
    expect(
      await prepareInterviewReminder(workspaceId, queued!.payload, now),
    ).toBeNull();
    await db
      .update(applications)
      .set({ status: "active" })
      .where(eq(applications.id, applicationId));
    expect(
      await prepareInterviewReminder(workspaceId, queued!.payload, scheduledAt),
    ).toBeNull();
    await configure({ enabled: false });
    expect(
      await prepareInterviewReminder(workspaceId, queued!.payload, now),
    ).toBeNull();
    revision = randomUUID();
    await configure();
    expect(
      await prepareInterviewReminder(workspaceId, queued!.payload, now),
    ).toBeNull();
    await dispatchInterviewReminders(now);
    expect(await rows()).toHaveLength(1);
  });
  it("leaves Cal.com bookings to Cal.com unless Talmore is explicitly selected", async () => {
    await db
      .update(interviews)
      .set({ source: "cal.com-personal" })
      .where(eq(interviews.id, interviewId));
    await configure();
    await dispatchInterviewReminders(now);
    expect(await rows()).toHaveLength(0);
    await configure({ calReminders: "talmore" });
    await dispatchInterviewReminders(now);
    expect(await rows()).toHaveLength(1);
    const [queued] = await rows();
    await configure();
    expect(
      await prepareInterviewReminder(workspaceId, queued!.payload, now),
    ).toBeNull();
  });
  it("does not backfill before enablement or after an outage longer than one hour", async () => {
    await configure({}, now);
    await dispatchInterviewReminders(now);
    expect(await rows()).toHaveLength(0);
    await configure();
    await dispatchInterviewReminders(new Date(now.getTime() + 2 * 3600000));
    expect(await rows()).toHaveLength(0);
    await db
      .update(interviews)
      .set({ status: "completed" })
      .where(eq(interviews.id, interviewId));
    await dispatchInterviewReminders(now);
    expect(await rows()).toHaveLength(0);
  });
  it("requires settings permission and rejects invalid timing, timezone and message variables", async () => {
    auth.requirePermission.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      saveInterviewReminderSettings(DEFAULT_INTERVIEW_REMINDER),
    ).rejects.toThrow("Forbidden");
    expect(await getInterviewReminderSettings(workspaceId)).toBeNull();
    for (const patch of [
      { hoursBefore: 0 },
      { timeZone: "Invalid/Zone" },
      { body: "{{candidate.password}}" },
    ])
      expect(
        (
          await saveInterviewReminderSettings({
            ...DEFAULT_INTERVIEW_REMINDER,
            ...patch,
          })
        ).ok,
      ).toBe(false);
    expect(
      (
        await saveInterviewReminderSettings({
          ...DEFAULT_INTERVIEW_REMINDER,
          enabled: true,
        })
      ).ok,
    ).toBe(true);
    expect(auth.requirePermission).toHaveBeenCalledWith("settings:edit");
    expect(
      (await getInterviewReminderSettings(workspaceId))?.settings.enabled,
    ).toBe(true);
  });
});
