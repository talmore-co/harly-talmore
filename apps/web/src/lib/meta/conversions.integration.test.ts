import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  organization,
  user,
  jobs,
  jobStages,
  applications,
  workspaceSettings,
  metaConversionEvents,
} from "@harly/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
let createPublicApplication: typeof import("@/features/applications/data").createPublicApplication;
import {
  dispatchMetaConversions,
  enqueueMetaConversions,
  getMetaStatus,
} from "./conversions";
import { metaRequestContext } from "./request-context";
import { captureAttribution, type ApplicationAttribution } from "@/features/applications/attribution";
import { saveWorkspaceMetaSettings } from "@/features/workspaces/meta-actions";

const mocks = vi.hoisted(() => ({ permission: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.permission,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn().mockResolvedValue(null),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));

const integration =
  process.env.RUN_META_INTEGRATION === "1" ? describe : describe.skip;
integration("Meta transactional conversion delivery", () => {
  const workspaceId = `meta-${randomUUID()}`,
    userId = randomUUID(),
    jobId = randomUUID();
  let seeded = false;
  const fetchMock = vi.fn();
  const context = {
    client_user_agent: "Fictional applicant browser",
    client_ip_address: "203.0.113.4",
    fbc: "fb.1.1700000000000.fictional",
  };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("eval")
    )
      throw new Error("Use isolated local evaluation database.");
    vi.stubEnv("AI_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3100");
    ({ createPublicApplication } =
      await import("@/features/applications/data"));
    seeded = true;
    await db.insert(organization).values({
      id: workspaceId,
      name: "Fictional Meta test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: userId,
      name: "Fictional recruiter",
      email: `${userId}@example.test`,
    });
    await db.insert(jobs).values({
      id: jobId,
      workspaceId,
      createdById: userId,
      title: "Fictional Meta vacancy",
      slug: jobId,
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Fictional only",
      status: "open",
      applicationConfig: {
        resumeRequired: false,
        sections: { profile: { resume: { visibility: "optional" } } },
        qualifiedScoreThreshold: 70,
        questions: [
          {
            id: "shift",
            label: "Available?",
            type: "select",
            required: true,
            options: ["Yes", "No"],
            scoring: {
              weight: 1,
              answers: [
                { option: "Yes", score: 10 },
                { option: "No", score: 0 },
              ],
            },
          },
        ],
      },
    });
    await db.insert(jobStages).values({
      id: randomUUID(),
      jobId,
      workspaceId,
      name: "Applied",
      order: 0,
    });
  });
  beforeEach(async () => {
    mocks.permission.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userId },
    });
    fetchMock
      .mockReset()
      .mockResolvedValue(
        new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
      );
    // Each fetch needs a fresh Response body.
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await db
      .delete(metaConversionEvents)
      .where(eq(metaConversionEvents.workspaceId, workspaceId));
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: workspaceId,
        metaPixelId: "12345000000",
        metaCapiEnabled: true,
        metaCapiToken: encryptSecret("fictional-token"),
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          metaPixelId: "12345000000",
          metaCapiEnabled: true,
          metaCapiToken: encryptSecret("fictional-token"),
          metaTestEventCode: null,
        },
      });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    if (seeded) {
      await db.delete(organization).where(eq(organization.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    }
    vi.unstubAllEnvs();
  });
  async function apply(choice = "Yes", consent = true, attribution?: ApplicationAttribution | null) {
    const result = await createPublicApplication(
      { workspaceSlug: workspaceId, jobSlug: jobId },
      {
        firstName: "Fictional",
        lastName: "Applicant",
        email: `${randomUUID()}@example.test`,
        educationEntries: [],
        experienceEntries: [],
        questionAnswers: { shift: choice },
      },
      {
        metaContext: consent
          ? context
          : metaRequestContext(new Headers(), "203.0.113.4"),
        attribution,
      },
    );
    if (!result.ok) throw new Error(result.message);
    return result;
  }
  const events = () =>
    db
      .select()
      .from(metaConversionEvents)
      .where(eq(metaConversionEvents.workspaceId, workspaceId));
  it("persists attribution per application and rejects another workspace's snapshot", async () => {
    const attribution = captureAttribution(new URL("https://ats.example.test/jobs/fictional?utm_source=facebook&ad_id=123"), workspaceId, null);
    const first = await apply("No", true, attribution);
    const [saved] = await db.select({ attribution: applications.attribution }).from(applications).where(eq(applications.id, first.applicationId));
    expect(saved?.attribution).toEqual(attribution);
    const other = await apply("No", true, { ...attribution!, workspaceId: "different-workspace" });
    const [rejected] = await db.select({ attribution: applications.attribution }).from(applications).where(eq(applications.id, other.applicationId));
    expect(rejected?.attribution).toBeNull();
  });
  it("queues qualified events atomically with matching browser IDs and no answer PII", async () => {
    const application = await apply();
    const rows = await events();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.eventId).sort()).toEqual(
      [
        application.applicationId,
        `${application.applicationId}:qualified`,
      ].sort(),
    );
    const payload = JSON.parse(decryptSecret(rows[0]!.payload!));
    expect(payload.custom_data).toEqual({ content_ids: [jobId] });
    expect(payload.user_data).toEqual(context);
    expect(JSON.stringify(payload)).not.toMatch(
      /email|firstName|questionnaire|score|answer/,
    );
    expect(JSON.stringify(rows)).not.toContain("Fictional applicant browser");
    await Promise.all([dispatchMetaConversions(), dispatchMetaConversions()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (await events()).every(
        (row) => row.status === "delivered" && row.payload === null,
      ),
    ).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).not.toContain("fictional-token");
  });
  it("accepts below-threshold applications but queues only the submission", async () => {
    await apply("No");
    expect((await events()).map((row) => row.eventName)).toEqual([
      "SubmitApplication",
    ]);
  });
  it("releases database locks while sending and preserves cancellation during an in-flight request", async () => {
    await apply("No");
    let started!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; });
    let finish!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => {
      finish = () => resolve(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
      started();
    }));
    const dispatch = dispatchMetaConversions();
    await sending;
    try {
      const saved = await saveWorkspaceMetaSettings({ pixelId: "", enabled: false, removeToken: true });
      expect(saved.ok).toBe(true);
    } finally { finish(); }
    await dispatch;
    expect((await events())[0]).toMatchObject({ status: "cancelled", payload: null });
  });
  it("recovers an expired worker lease without changing the event identity", async () => {
    await apply("No");
    const [original] = await events();
    await db.update(metaConversionEvents).set({ attempts: 1, nextAttemptAt: new Date(Date.now() + 120_000) }).where(eq(metaConversionEvents.id, original!.id));
    await dispatchMetaConversions(); expect(fetchMock).not.toHaveBeenCalled();
    await db.update(metaConversionEvents).set({ nextAttemptAt: new Date(0) }).where(eq(metaConversionEvents.id, original!.id));
    await dispatchMetaConversions();
    expect((await events())[0]).toMatchObject({ eventId: original!.eventId, attempts: 2, status: "delivered" });
  });
  it("saves applications without consent and never queues or sends them", async () => {
    await apply("Yes", false);
    expect(await events()).toHaveLength(0);
    await dispatchMetaConversions();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retries transient errors with the original event IDs and redacts provider errors", async () => {
    await apply("No");
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "fictional-token should not be stored" },
          }),
          { status: 503 },
        ),
    );
    await dispatchMetaConversions();
    const [pending] = await events();
    expect(pending?.status).toBe("pending");
    expect(pending?.attempts).toBe(1);
    expect(pending?.lastError).not.toContain("fictional-token");
    await db
      .update(metaConversionEvents)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(metaConversionEvents.id, pending!.id));
    await dispatchMetaConversions();
    const [sent] = await events();
    expect(sent?.eventId).toBe(pending?.eventId);
    expect(sent?.status).toBe("delivered");
    expect(sent?.payload).toBeNull();
  });
  it("does not retry permanent failures or retain matching data", async () => {
    await apply("No");
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 }),
    );
    await dispatchMetaConversions();
    expect((await events())[0]).toMatchObject({
      status: "failed",
      payload: null,
      attempts: 1,
    });
    await dispatchMetaConversions();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("disconnect cancels queued deliveries and erases the token", async () => {
    await apply();
    await saveWorkspaceMetaSettings({
      pixelId: "",
      enabled: false,
      removeToken: true,
    });
    await dispatchMetaConversions();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (await events()).every(
        (row) => row.status === "cancelled" && row.payload === null,
      ),
    ).toBe(true);
    expect(await getMetaStatus(workspaceId)).toMatchObject({
      pixelId: "",
      hasToken: false,
      enabled: false,
    });
  });
  it("rejects unauthorized settings changes", async () => {
    mocks.permission.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      saveWorkspaceMetaSettings({ pixelId: "", enabled: false }),
    ).rejects.toThrow("Forbidden");
    expect((await getMetaStatus(workspaceId)).hasToken).toBe(true);
  });
  it("expires old events instead of sending outside the deduplication window", async () => {
    await apply("No");
    await db
      .update(metaConversionEvents)
      .set({ eventTime: new Date(Date.now() - 48 * 3600_000) })
      .where(eq(metaConversionEvents.workspaceId, workspaceId));
    await dispatchMetaConversions();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await events())[0]).toMatchObject({
      status: "cancelled",
      payload: null,
    });
  });
  it("keeps test routing fixed at submission time and never exposes saved tokens", async () => {
    await saveWorkspaceMetaSettings({
      pixelId: "12345000000",
      enabled: true,
      testEventCode: "TEST123",
    });
    await apply("No");
    await saveWorkspaceMetaSettings({
      pixelId: "12345000000",
      enabled: true,
      testEventCode: "",
    });
    await dispatchMetaConversions();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).test_event_code).toBe(
      "TEST123",
    );
    expect(JSON.stringify(await getMetaStatus(workspaceId))).not.toContain(
      "fictional-token",
    );
    expect(JSON.stringify(await getMetaStatus(workspaceId))).not.toContain(
      "ciphertext",
    );
  });
  it("requires a replacement token for destination changes and cancels old events", async () => {
    await apply("No");
    expect(
      await saveWorkspaceMetaSettings({
        pixelId: "99999000000",
        enabled: true,
      }),
    ).toMatchObject({ ok: false });
    await saveWorkspaceMetaSettings({
      pixelId: "99999000000",
      enabled: true,
      accessToken: "fictional-new-token",
    });
    expect((await events())[0]).toMatchObject({
      status: "cancelled",
      payload: null,
    });
    await dispatchMetaConversions();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rolls back enqueued events and deduplicates repeated queueing", async () => {
    const application = await apply("No");
    await db
      .delete(metaConversionEvents)
      .where(eq(metaConversionEvents.workspaceId, workspaceId));
    const input = {
      workspaceId,
      applicationId: application.applicationId,
      jobId,
      jobSlug: jobId,
      qualified: false,
      context,
    };
    await expect(
      db.transaction(async (tx) => {
        await enqueueMetaConversions(tx, input);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await events()).toHaveLength(0);
    await db.transaction(async (tx) => {
      await enqueueMetaConversions(tx, input);
      await enqueueMetaConversions(tx, input);
    });
    expect(await events()).toHaveLength(1);
    await db
      .delete(applications)
      .where(eq(applications.id, application.applicationId));
    expect(await events()).toHaveLength(0);
  });
});
