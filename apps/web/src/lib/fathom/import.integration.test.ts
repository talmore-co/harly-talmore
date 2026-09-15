import { createHmac, randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  organization,
  user,
  member,
  candidates,
  jobs,
  jobStages,
  applications,
  interviews,
  personalFathomConnections,
  interviewRecordings,
  customRoles,
} from "@harly/db";
import { encryptSecret } from "@/lib/crypto";
import { importFathomWebhook } from "./import";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  createHook: vi.fn(),
  deleteHook: vi.fn(),
}));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  createFathomWebhook: mocks.createHook,
  deleteFathomWebhook: mocks.deleteHook,
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
}));
import {
  disconnectMyFathomConnection,
  getInterviewRecordings,
  connectMyFathomAccount,
  getMyFathomConnection,
  resetIncompleteFathomSetup,
} from "@/features/account/fathom-actions";
import { FathomApiError } from "./client";
import { listCandidateInterviews } from "@/features/interviews/data";

const integration =
  process.env.RUN_FATHOM_INTEGRATION === "1" ? describe : describe.skip;
integration("Fathom interview import", () => {
  const workspaceId = `fathom-${randomUUID()}`;
  const otherWorkspaceId = `fathom-${randomUUID()}`;
  const userId = randomUUID(),
    candidateId = randomUUID(),
    jobId = randomUUID(),
    stageId = randomUUID(),
    applicationId = randomUUID(),
    interviewId = randomUUID(),
    connectionId = randomUUID();
  const secret = `whsec_${Buffer.alloc(32, 9).toString("base64")}`;
  let seeded = false;
  const meeting = {
    recording_id: 100,
    url: "https://fathom.video/calls/100",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    scheduled_start_time: "2026-09-15T12:00:00Z",
    recorded_by: { email: "recruiter@example.test" },
    calendar_invitees: [{ email: "candidate@example.test" }],
    default_summary: { markdown_formatted: "Fictional interview summary" },
    transcript: [
      {
        speaker: { display_name: "Fictional Candidate" },
        text: "Fictional answer",
        timestamp: "00:01:00",
      },
    ],
  };
  async function send(payload = meeting, id = connectionId) {
    const raw = JSON.stringify(payload),
      timestamp = String(Math.floor(Date.now() / 1000));
    const headers = new Headers({
      "webhook-id": "msg_test",
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${createHmac("sha256", Buffer.alloc(32, 9)).update(`msg_test.${timestamp}.${raw}`).digest("base64")}`,
    });
    return importFathomWebhook(id, raw, headers);
  }
  const recordings = () =>
    db
      .select()
      .from(interviewRecordings)
      .where(eq(interviewRecordings.workspaceId, workspaceId));
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("eval")
    )
      throw new Error("Use isolated local evaluation database.");
    seeded = true;
    await db.insert(organization).values(
      [workspaceId, otherWorkspaceId].map((id) => ({
        id,
        slug: id,
        name: "Fictional Fathom test",
        createdAt: new Date(),
      })),
    );
    await db.insert(user).values({
      id: userId,
      name: "Fictional Recruiter",
      email: `${userId}@example.test`,
    });
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: workspaceId,
      userId,
      role: "owner",
      status: "active",
      createdAt: new Date(),
    });
    await db.insert(candidates).values({
      id: candidateId,
      workspaceId,
      firstName: "Fictional",
      lastName: "Candidate",
      email: "candidate@example.test",
    });
    await db.insert(jobs).values({
      id: jobId,
      workspaceId,
      createdById: userId,
      title: "Fictional Role",
      slug: jobId,
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Test",
      status: "open",
    });
    await db
      .insert(jobStages)
      .values({ id: stageId, workspaceId, jobId, name: "Applied", order: 0 });
    await db.insert(applications).values({
      id: applicationId,
      workspaceId,
      jobId,
      candidateId,
      currentStageId: stageId,
      source: "manual",
    });
    await db
      .insert(personalFathomConnections)
      .values({ id: connectionId, workspaceId, userId });
  });
  beforeEach(async () => {
    mocks.createHook
      .mockReset()
      .mockResolvedValue({ id: "fictional-hook", secret });
    mocks.deleteHook.mockReset().mockResolvedValue(undefined);
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "owner",
    });
    await db.delete(interviews).where(eq(interviews.workspaceId, workspaceId));
    await db
      .update(candidates)
      .set({ deletedAt: null })
      .where(eq(candidates.id, candidateId));
    await db.update(jobs).set({ deletedAt: null }).where(eq(jobs.id, jobId));
    await db
      .update(member)
      .set({ status: "active" })
      .where(
        and(eq(member.organizationId, workspaceId), eq(member.userId, userId)),
      );
    await db
      .update(personalFathomConnections)
      .set({
        secret: encryptSecret(secret),
        recorderEmail: "recruiter@example.test",
        lastImportedAt: null,
        apiKey: encryptSecret("fictional-api-key"),
        webhookId: "fictional-hook",
        setupPending: false,
      })
      .where(eq(personalFathomConnections.id, connectionId));
    await db.insert(interviews).values({
      id: interviewId,
      workspaceId,
      applicationId,
      candidateId,
      jobId,
      interviewerId: userId,
      scheduledAt: new Date(meeting.scheduled_start_time),
      meetLink: meeting.meeting_url,
    });
  });
  afterAll(async () => {
    if (!seeded) return;
    await db
      .delete(organization)
      .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("imports once under concurrent delivery and preserves original content", async () => {
    await Promise.all([send(), send()]);
    await send({
      ...meeting,
      default_summary: { markdown_formatted: "changed" },
    });
    const rows = await recordings();
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe(meeting.default_summary.markdown_formatted);
    expect(rows[0].interviewId).toBe(interviewId);
    expect(rows[0].transcript?.[0].speaker).toBe("Fictional Candidate");
    expect(await getInterviewRecordings(interviewId)).toHaveLength(1);
    expect((await listCandidateInterviews(candidateId))[0].hasRecordings).toBe(true);
  });
  it("discards unrelated meetings without storing content or updating last import", async () => {
    expect(
      await send({
        ...meeting,
        meeting_url: "https://meet.google.com/xxx-yyyy-zzz",
      }),
    ).toBe("ignored");
    expect(await recordings()).toHaveLength(0);
    const [connection] = await db
      .select()
      .from(personalFathomConnections)
      .where(eq(personalFathomConnections.id, connectionId));
    expect(connection.lastImportedAt).toBeNull();
  });
  it("ignores ambiguous matching interviews", async () => {
    await db.insert(interviews).values({
      workspaceId,
      applicationId,
      candidateId,
      jobId,
      interviewerId: userId,
      scheduledAt: new Date(meeting.scheduled_start_time),
      meetLink: meeting.meeting_url,
    });
    expect(await send()).toBe("ignored");
    expect(await recordings()).toHaveLength(0);
  });
  it("ignores canceled interviews and interviews assigned to someone else", async () => {
    await db
      .update(interviews)
      .set({ status: "canceled" })
      .where(eq(interviews.id, interviewId));
    expect(await send()).toBe("ignored");
    await db
      .update(interviews)
      .set({ status: "scheduled", interviewerId: null })
      .where(eq(interviews.id, interviewId));
    expect(await send()).toBe("ignored");
  });
  it("does not import for trashed candidates or jobs", async () => {
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    expect(await send()).toBe("ignored");
    await db
      .update(candidates)
      .set({ deletedAt: null })
      .where(eq(candidates.id, candidateId));
    await db
      .update(jobs)
      .set({ deletedAt: new Date() })
      .where(eq(jobs.id, jobId));
    expect(await send()).toBe("ignored");
  });
  it("stops imports after disconnect and preserves existing content", async () => {
    await send();
    await disconnectMyFathomConnection();
    expect(await send({ ...meeting, recording_id: 101 })).toBe("disabled");
    expect(await recordings()).toHaveLength(1);
  });
  it("rejects unsigned payloads", async () => {
    expect(
      await importFathomWebhook(
        connectionId,
        JSON.stringify(meeting),
        new Headers(),
      ),
    ).toBe("unauthorized");
    expect(await recordings()).toHaveLength(0);
  });
  it("does not import when membership is inactive", async () => {
    await db
      .delete(member)
      .where(
        and(eq(member.organizationId, workspaceId), eq(member.userId, userId)),
      );
    expect(await send()).toBe("disabled");
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: workspaceId,
      userId,
      role: "owner",
      status: "active",
      createdAt: new Date(),
    });
  });
  it("denies recording access from another workspace", async () => {
    await send();
    mocks.context.mockResolvedValue({
      organization: { id: otherWorkspaceId },
      user: { id: userId },
      roleKey: "owner",
    });
    await expect(getInterviewRecordings(interviewId)).rejects.toThrow();
  });
  it("cascades recordings on interview deletion", async () => {
    await send();
    await db.delete(interviews).where(eq(interviews.id, interviewId));
    expect(await recordings()).toHaveLength(0);
  });
  it("creates one webhook for repeated concurrent connects and encrypts both secrets", async () => {
    await disconnectMyFathomConnection();
    await Promise.all([
      connectMyFathomAccount({ apiKey: "fictional-api-key" }),
      connectMyFathomAccount({ apiKey: "fictional-api-key" }),
    ]);
    expect(mocks.createHook).toHaveBeenCalledTimes(1);
    const status = await getMyFathomConnection();
    expect(status.enabled).toBe(true);
    expect(JSON.stringify(status)).not.toContain(secret);
    expect(JSON.stringify(status)).not.toContain("fictional-api-key");
    const [row] = await db
      .select()
      .from(personalFathomConnections)
      .where(eq(personalFathomConnections.id, connectionId));
    expect(row.apiKey?.ciphertext).not.toContain("fictional-api-key");
    expect(row.secret?.ciphertext).not.toContain(secret);
    // The API's own-recording subscription establishes identity on the first matched call.
    expect(await send()).toBe("imported");
  });
  it("keeps uncertain registrations reserved rather than creating duplicate hooks", async () => {
    await disconnectMyFathomConnection();
    mocks.createHook.mockRejectedValue(new Error("Network timeout"));
    expect(
      (await connectMyFathomAccount({ apiKey: "fictional-api-key" })).ok,
    ).toBe(false);
    expect(
      (await connectMyFathomAccount({ apiKey: "fictional-api-key" })).ok,
    ).toBe(false);
    expect(mocks.createHook).toHaveBeenCalledTimes(1);
    expect((await getMyFathomConnection()).setupPending).toBe(true);
    expect(
      (await resetIncompleteFathomSetup({ removedWebhook: false })).ok,
    ).toBe(false);
    await resetIncompleteFathomSetup({ removedWebhook: true });
    expect((await getMyFathomConnection()).setupPending).toBe(false);
  });
  it("allows retry after a definite rejected-key response", async () => {
    await disconnectMyFathomConnection();
    mocks.createHook.mockRejectedValueOnce(new FathomApiError(401));
    expect(
      (await connectMyFathomAccount({ apiKey: "fictional-api-key" })).ok,
    ).toBe(false);
    expect((await getMyFathomConnection()).setupPending).toBe(false);
    expect(
      (await connectMyFathomAccount({ apiKey: "fictional-api-key" })).ok,
    ).toBe(true);
  });
  it("serializes disconnect against in-flight registration", async () => {
    await disconnectMyFathomConnection();
    mocks.deleteHook.mockClear();
    let started!: () => void;
    let release!: () => void;
    const registering = new Promise<void>((resolve) => {
      started = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.createHook.mockImplementation(async () => {
      started();
      await released;
      return { id: "fictional-hook", secret };
    });
    const connecting = connectMyFathomAccount({ apiKey: "fictional-api-key" });
    await registering;
    const disconnecting = disconnectMyFathomConnection();
    release();
    await Promise.all([connecting, disconnecting]);
    expect((await getMyFathomConnection()).enabled).toBe(false);
    expect(mocks.deleteHook).toHaveBeenCalledTimes(1);
  });
  it("stops imports during provider cleanup failures and retries only our webhook", async () => {
    mocks.deleteHook.mockRejectedValueOnce(new Error("offline"));
    expect((await disconnectMyFathomConnection()).ok).toBe(false);
    expect((await getMyFathomConnection()).cleanupPending).toBe(true);
    expect(await send()).toBe("disabled");
    expect((await disconnectMyFathomConnection()).ok).toBe(true);
    expect(mocks.deleteHook).toHaveBeenLastCalledWith(
      "fictional-api-key",
      "fictional-hook",
    );
    const [row] = await db
      .select()
      .from(personalFathomConnections)
      .where(eq(personalFathomConnections.id, connectionId));
    expect(row.apiKey).toBeNull();
    expect(row.secret).toBeNull();
  });
  it("denies transcript access when the job is outside the viewer's assigned scope", async () => {
    await send();
    await db
      .insert(customRoles)
      .values({
        workspaceId,
        key: "fathom-scoped",
        name: "Fictional scoped role",
        permissions: ["candidates:view"],
        scope: { jobAccess: "assigned" },
      });
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
      roleKey: "fathom-scoped",
    });
    await expect(getInterviewRecordings(interviewId)).rejects.toThrow();
  });
});
