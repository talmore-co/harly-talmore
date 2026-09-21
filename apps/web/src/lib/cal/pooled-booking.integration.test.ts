import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  applications,
  automationBookingInvitations,
  candidates,
  db,
  emailOutbox,
  activityEvents,
  customRoles,
  jobHiringTeam,
  interviews,
  jobs,
  jobStages,
  member,
  organization,
  personalCalConnections,
  personalCalEvents,
  user,
  workflowDefinitions,
} from "@harly/db";

const provider = vi.hoisted(() => ({ fetch: vi.fn(), booking: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(),
}));
vi.mock("./personal-client", async (original) => ({
  ...(await original<typeof import("./personal-client")>()),
  personalCalFetch: provider.fetch,
  getPersonalCalBooking: provider.booking,
}));
vi.mock("./personal", async (original) => ({
  ...(await original<typeof import("./personal")>()),
  personalCalApiKey: (connection: { id: string }) => connection.id,
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn().mockResolvedValue({}),
  publishPersistedDomainEvents: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));
import {
  confirmPooledBooking,
  getPooledBookingPage,
  reconcilePooledBookings,
} from "./pooled-booking";
import { signBookingInvitation } from "./invitation-token";
import { syncPersonalCalBooking } from "./personal-bookings";
import { hasBookingReservation } from "./booking-reservations";
import { validateBookingPool } from "./pool-hosts";
import { CalApiError, type PersonalCalBooking } from "./personal-client";
import { findBookingInvitation, invitationLink, prepareManualBookingMessage, saveManualBookingInvitation } from "@/features/interviews/booking-invitations";
import { BOOKING_INVITATION_MESSAGE } from "@/features/automations/builder/message-defaults";
import { inspectBulkBookingApplication, sendBulkBookingInvitations } from "@/features/interviews/bulk-booking-invitations";
import { getBulkBookingInvitationOptions } from "@/features/interviews/booking-invitation-actions";
import { getWorkspaceContext } from "@/features/workspaces/context";

const integration =
  process.env.RUN_PERSONAL_CAL_INTEGRATION === "1" ? describe : describe.skip;
integration("personal invitation pooled booking", () => {
  let workspaceId: string,
    actors: string[],
    candidateId: string,
    applicationId: string,
    jobId: string,
    stageId: string,
    workflowId: string,
    invitationId: string;
  let connections: string[],
    events: string[],
    token: string,
    start: string,
    later: string;
  let created: PersonalCalBooking | null,
    loseResponse: boolean,
    rejectWrite: boolean;
  const posts = () =>
    provider.fetch.mock.calls.filter(
      (call) => call[1] === "/bookings" && call[2] === "POST",
    );
  beforeEach(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/harly_talmore_eval"
    )
      throw new Error("Use local evaluation DB");
    provider.fetch.mockReset();
    provider.booking.mockReset();
    workspaceId = randomUUID();
    actors = [randomUUID(), randomUUID()];
    candidateId = randomUUID();
    applicationId = randomUUID();
    jobId = randomUUID();
    stageId = randomUUID();
    workflowId = randomUUID();
    invitationId = randomUUID();
    connections = [randomUUID(), randomUUID()];
    events = [randomUUID(), randomUUID()];
    const at = new Date(Date.now() + 3 * 86400000);
    at.setUTCHours(10, 0, 0, 0);
    start = at.toISOString();
    later = new Date(at.getTime() + 3600000).toISOString();
    created = null;
    loseResponse = false;
    rejectWrite = false;
    await db
      .insert(user)
      .values(
        actors.map((id) => ({
          id,
          name: "Fictional recruiter",
          email: `${id}@example.test`,
        })),
      );
    await db
      .insert(organization)
      .values({
        id: workspaceId,
        slug: workspaceId,
        name: "Fictional pooled booking",
        createdAt: new Date(),
      });
    await db
      .insert(member)
      .values(
        actors.map((id) => ({
          id: randomUUID(),
          organizationId: workspaceId,
          userId: id,
          role: "owner",
          createdAt: new Date(),
        })),
      );
    await db
      .insert(candidates)
      .values({
        id: candidateId,
        workspaceId,
        firstName: "Fictional",
        lastName: "Applicant",
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
        createdById: actors[0],
      });
    await db
      .insert(jobStages)
      .values({ id: stageId, workspaceId, jobId, name: "Screening", order: 0 });
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
      .insert(workflowDefinitions)
      .values({
        id: workflowId,
        workspaceId,
        name: "Fictional invitation",
        triggerEvent: "application.evaluated",
        trigger: { event: "application.evaluated", runtimeVersion: 2 },
        conditions: {},
        actions: [],
        status: "published",
        enabled: true,
        createdById: actors[0],
        definitionVersion: 1,
      });
    await db
      .insert(personalCalConnections)
      .values(
        connections.map((id, index) => ({
          id,
          workspaceId,
          userId: actors[index]!,
          calUserId: index + 1,
          username: `fictional-${index}`,
          accountEmail: `${actors[index]}@example.test`,
          defaultEventTypeId: index + 101,
          apiKeyCiphertext: "fixture",
        })),
      );
    await db
      .insert(personalCalEvents)
      .values(
        events.map((id, index) => ({
          id,
          connectionId: connections[index]!,
          eventTypeId: index + 101,
          title: "Fictional interview",
          bookingUrl: "https://cal.com/fictional/interview",
          durationMins: 30,
          webhookId: "fixture",
          webhookSecret: "fixture-only",
        })),
      );
    await db
      .insert(automationBookingInvitations)
      .values({
        id: invitationId,
        workspaceId,
        applicationId,
        workflowId,
        stageId,
        eventIds: events,
        tokenSecret: "fixture-secret",
        expiresAt: new Date(Date.now() + 90 * 86400000),
        definitionVersion: 1,
        durationMins: 30,
        locationFormat: "video",
      });
    token = signBookingInvitation(invitationId, "fixture-secret");
    provider.fetch.mockImplementation(
      async (
        key: string,
        path: string,
        method = "GET",
        body?: {
          eventTypeId: number;
          start: string;
          metadata: Record<string, string>;
        },
      ) => {
        const index = connections.indexOf(key);
        if (path.startsWith("/event-types/"))
          return {
            id: index + 101,
            ownerId: index + 1,
            users: [{ id: index + 1 }],
            lengthInMinutes: 30,
            locations: [{ type: "integration", integration: "google-meet" }],
            price: 0,
            recurrence: null,
            isInstantEvent: false,
            bookingFields: [
              { field: "name", variant: "fullName", required: true },
              { field: "email", required: true },
            ],
          };
        if (path.startsWith("/slots?"))
          return {
            [start.slice(0, 10)]: (index === 0 ? [start, later] : [start]).map(
              (start) => ({ start }),
            ),
          };
        if (path.startsWith("/bookings?") && method === "GET")
          return {
            data: created ? [created] : [],
            pagination: { hasMore: false, nextCursor: null },
          };
        if (path === "/bookings" && method === "POST" && body) {
          if (rejectWrite) throw new CalApiError(409);
          created = {
            uid: randomUUID(),
            title: "Fictional interview",
            status: "accepted",
            start: body.start,
            end: new Date(Date.parse(body.start) + 1800000).toISOString(),
            createdAt: new Date().toISOString(),
            hosts: [{ id: index + 1 }],
            attendees: [
              {
                name: "Fictional Applicant",
                email: `${candidateId}@example.test`,
              },
            ],
            eventTypeId: body.eventTypeId,
            metadata: body.metadata,
            location: "https://meet.example.test/fixture",
          };
          if (loseResponse)
            throw new Error("Fictional timeout after provider commit");
          return { uid: created.uid, status: created.status };
        }
        throw new Error("Unexpected provider request");
      },
    );
    provider.booking.mockImplementation(async () => created);
  });
  afterEach(async () => {
    if (workspaceId)
      await db.delete(organization).where(eq(organization.id, workspaceId));
    if (actors?.length) await db.delete(user).where(inArray(user.id, actors));
  });
  const manualInput = () => ({ applicationId, interviewerIds: actors, interviewType: "technical" as const, operation: "create" as const, delivery: "copy" as const, requestId: randomUUID(), ...BOOKING_INVITATION_MESSAGE });

  it("loads, emails and reconciles booking for stored application IDs with non-RFC UUID bits", async () => {
    await db.delete(automationBookingInvitations).where(eq(automationBookingInvitations.id, invitationId));
    const parts = randomUUID().split("-");
    parts[2] = `f${parts[2]!.slice(1)}`;
    parts[3] = `7${parts[3]!.slice(1)}`;
    const importedId = parts.join("-");
    await db.update(applications).set({ id: importedId }).where(eq(applications.id, applicationId));
    applicationId = importedId;
    vi.mocked(getWorkspaceContext).mockResolvedValue({ roleKey: "owner", organization: { id: workspaceId }, user: { id: actors[0] } } as Awaited<ReturnType<typeof getWorkspaceContext>>);
    expect((await getBulkBookingInvitationOptions([applicationId])).recipients[0]?.eligible).toBe(true);
    expect((await inspectBulkBookingApplication(workspaceId, actors[0]!, applicationId)).eligible).toBe(true);
    const results = await sendBulkBookingInvitations(workspaceId, actors[0]!, { ...manualInput(), applicationIds: [applicationId] });
    expect(results[0]?.status).toBe("queued");
    const [email] = await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId));
    expect(await prepareManualBookingMessage(workspaceId, actors[0]!, email!.payload)).not.toBeNull();
    const invitation = (await findBookingInvitation(workspaceId, applicationId))!;
    const pageToken = invitationLink(invitation).split("#")[1]!;
    await confirmPooledBooking(pageToken, start, "UTC");
    expect((await db.select().from(interviews).where(eq(interviews.applicationId, applicationId)))[0]?.type).toBe("technical");
  });

  it("bulk queues one personal email per eligible application and retries without duplicates", async () => {
    await db.delete(automationBookingInvitations).where(eq(automationBookingInvitations.id, invitationId));
    const secondCandidateId = randomUUID(), secondApplicationId = randomUUID();
    await db.insert(candidates).values({ id: secondCandidateId, workspaceId, firstName: "Second", lastName: "Fictional", email: `${secondCandidateId}@example.test` });
    await db.insert(applications).values({ id: secondApplicationId, workspaceId, candidateId: secondCandidateId, jobId, currentStageId: stageId });
    const inaccessible = randomUUID();
    const input = { ...manualInput(), applicationIds: [applicationId, secondApplicationId, inaccessible, applicationId] };
    const first = await sendBulkBookingInvitations(workspaceId, actors[0]!, input);
    expect(first.map((row) => row.status)).toEqual(["queued", "queued", "skipped"]);
    const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId));
    expect(rows).toHaveLength(2);
    const messages = await Promise.all(rows.map((row) => prepareManualBookingMessage(workspaceId, actors[0]!, row.payload)));
    expect(new Set(messages.map((message) => message?.to)).size).toBe(2);
    expect(new Set(messages.map((message) => message?.bodyHtml)).size).toBe(2);
    const retry = await sendBulkBookingInvitations(workspaceId, actors[0]!, input);
    expect(retry.map((row) => row.status)).toEqual(["queued", "queued", "skipped"]);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(2);
    expect(await db.select().from(interviews).where(eq(interviews.workspaceId, workspaceId))).toHaveLength(0);
  });

  it("bulk preserves existing invitation ownership and reports ineligible applications", async () => {
    const before = (await findBookingInvitation(workspaceId, applicationId))!;
    expect((await inspectBulkBookingApplication(workspaceId, actors[0]!, applicationId)).eligible).toBe(false);
    const result = await sendBulkBookingInvitations(workspaceId, actors[0]!, { ...manualInput(), applicationIds: [applicationId] });
    expect(result[0]?.status).toBe("skipped");
    expect((await findBookingInvitation(workspaceId, applicationId))?.workflowId).toBe(before.workflowId);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    await db.update(applications).set({ status: "rejected" }).where(eq(applications.id, applicationId));
    expect((await inspectBulkBookingApplication(workspaceId, actors[0]!, applicationId)).eligible).toBe(false);
  });

  it("bulk reports failed recipients without leaving partial invitations for invalid messages", async () => {
    await db.delete(automationBookingInvitations).where(eq(automationBookingInvitations.id, invitationId));
    const results = await sendBulkBookingInvitations(workspaceId, actors[0]!, { ...manualInput(), applicationIds: [applicationId], body: "{{candidate.privateField}}" });
    expect(results[0]?.status).toBe("failed");
    expect(await findBookingInvitation(workspaceId, applicationId)).toBeNull();
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
  });

  it("creates one manual link without email or interview, independent of workflow publication", async () => {
    await db.delete(automationBookingInvitations).where(eq(automationBookingInvitations.id, invitationId));
    const result = await saveManualBookingInvitation(workspaceId, actors[0]!, manualInput());
    expect(result.outboxId).toBeNull();
    expect(result.invitation.workflowId).toBeNull();
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    expect(await db.select().from(interviews).where(eq(interviews.workspaceId, workspaceId))).toHaveLength(0);
    expect((await db.select().from(activityEvents).where(eq(activityEvents.workspaceId, workspaceId)))[0]?.type).toBe("booking_invitation.created");
    await db.update(workflowDefinitions).set({ enabled: false }).where(eq(workflowDefinitions.id, workflowId));
    const manualToken = invitationLink(result.invitation).split("#")[1]!;
    expect((await getPooledBookingPage(manualToken)).slots).toEqual([start, later]);
    await confirmPooledBooking(manualToken, start, "UTC");
    const [interview] = await db.select().from(interviews).where(eq(interviews.applicationId, applicationId));
    expect(interview?.type).toBe("technical");
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
    expect(app?.currentStageId).toBe(stageId);
  });

  it("reuses an automation link and requires an explicit version-checked update to take over", async () => {
    const before = (await findBookingInvitation(workspaceId, applicationId))!;
    await expect(saveManualBookingInvitation(workspaceId, actors[0]!, manualInput())).rejects.toThrow("already exists");
    const reused = await saveManualBookingInvitation(workspaceId, actors[0]!, { ...manualInput(), operation: "reuse", expectedUpdatedAt: before.updatedAt.toISOString() });
    expect(reused.invitation.workflowId).toBe(workflowId);
    const updated = await saveManualBookingInvitation(workspaceId, actors[0]!, { ...manualInput(), operation: "update", interviewerIds: [actors[1]], expectedUpdatedAt: before.updatedAt.toISOString() });
    expect(invitationLink(updated.invitation)).toBe(invitationLink(before));
    expect(updated.invitation.eventIds).toEqual([events[1]]);
    expect(updated.invitation.workflowId).toBeNull();
    await expect(saveManualBookingInvitation(workspaceId, actors[0]!, { ...manualInput(), operation: "update", expectedUpdatedAt: before.updatedAt.toISOString() })).rejects.toThrow("changed");
  });

  it("queues only explicit email sends, deduplicates retries and suppresses stale messages", async () => {
    const before = (await findBookingInvitation(workspaceId, applicationId))!;
    const input = { ...manualInput(), operation: "reuse", delivery: "email", expectedUpdatedAt: before.updatedAt.toISOString() };
    const first = await saveManualBookingInvitation(workspaceId, actors[0]!, input);
    const retry = await saveManualBookingInvitation(workspaceId, actors[0]!, input);
    expect(retry.outboxId).toBe(first.outboxId);
    const [email] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, first.outboxId!));
    expect(email?.actorId).toBe(actors[0]);
    const message = await prepareManualBookingMessage(workspaceId, actors[0]!, email!.payload);
    expect(message?.subject).toBe("Choose an interview time for Fictional role");
    expect(message?.bodyHtml).toContain("/book/interview#");
    await saveManualBookingInvitation(workspaceId, actors[0]!, { ...manualInput(), operation: "update", expectedUpdatedAt: before.updatedAt.toISOString() });
    expect(await prepareManualBookingMessage(workspaceId, actors[0]!, email!.payload)).toBeNull();
  });

  it("checks job-scoped permissions and revokes a manual link when its creator is suspended", async () => {
    await db.delete(automationBookingInvitations).where(eq(automationBookingInvitations.id, invitationId));
    await db.insert(customRoles).values({ workspaceId, key: "booking-tester", name: "Booking tester", permissions: ["collab:write"], scope: { jobAccess: "assigned", departments: [], regions: [] } });
    await db.update(member).set({ role: "booking-tester" }).where(eq(member.userId, actors[0]!));
    await expect(saveManualBookingInvitation(workspaceId, actors[0]!, manualInput())).rejects.toThrow("access");
    await db.insert(jobHiringTeam).values({ workspaceId, jobId, userId: actors[0]! });
    const result = await saveManualBookingInvitation(workspaceId, actors[0]!, manualInput());
    const manualToken = invitationLink(result.invitation).split("#")[1]!;
    expect((await getPooledBookingPage(manualToken)).state).toBe("open");
    await db.update(member).set({ status: "suspended" }).where(eq(member.userId, actors[0]!));
    await expect(getPooledBookingPage(manualToken)).rejects.toThrow("no longer available");
  });

  it("rejects manual pool changes once confirmation has started", async () => {
    await db.update(automationBookingInvitations).set({ bookingState: "review" }).where(eq(automationBookingInvitations.id, invitationId));
    const before = (await findBookingInvitation(workspaceId, applicationId))!;
    await expect(saveManualBookingInvitation(workspaceId, actors[0]!, { ...manualInput(), operation: "update", expectedUpdatedAt: before.updatedAt.toISOString() })).rejects.toThrow("being confirmed");
  });
  it("serializes competing manual invitation creates without duplicate activity or email", async () => {
    await db.delete(automationBookingInvitations).where(eq(automationBookingInvitations.id, invitationId));
    const results = await Promise.allSettled(actors.map((actorId) => saveManualBookingInvitation(workspaceId, actorId, manualInput())));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(automationBookingInvitations).where(eq(automationBookingInvitations.applicationId, applicationId))).toHaveLength(1);
    expect(await db.select().from(activityEvents).where(eq(activityEvents.workspaceId, workspaceId))).toHaveLength(1);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
  });
  it("checks the email sender separately from invitation ownership and escapes candidate-facing content", async () => {
    const before = (await findBookingInvitation(workspaceId, applicationId))!;
    const sent = await saveManualBookingInvitation(workspaceId, actors[1]!, { ...manualInput(), operation: "reuse", delivery: "email", expectedUpdatedAt: before.updatedAt.toISOString(), body: "Hi {{candidate.firstName}}, <script>no HTML</script>" });
    const [email] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, sent.outboxId!));
    expect((await prepareManualBookingMessage(workspaceId, actors[1]!, email!.payload))?.bodyHtml).toContain("&lt;script&gt;");
    await db.update(member).set({ status: "suspended" }).where(eq(member.userId, actors[1]!));
    expect(await prepareManualBookingMessage(workspaceId, actors[1]!, email!.payload)).toBeNull();
    expect((await getPooledBookingPage(token)).state).toBe("open");
    await db.update(member).set({ status: "active" }).where(eq(member.userId, actors[1]!));
    await db.update(applications).set({ status: "rejected" }).where(eq(applications.id, applicationId));
    expect(await prepareManualBookingMessage(workspaceId, actors[1]!, email!.payload)).toBeNull();
    await expect(saveManualBookingInvitation(randomUUID(), actors[0]!, manualInput())).rejects.toThrow("access");
  });
  it("merges shared slots once and excludes ATS conflicts without hiding another free recruiter", async () => {
    expect((await getPooledBookingPage(token)).slots).toEqual([start, later]);
    const otherCandidate = randomUUID(),
      otherApplication = randomUUID();
    await db
      .insert(candidates)
      .values({
        id: otherCandidate,
        workspaceId,
        firstName: "Fictional",
        lastName: "Busy",
        email: `${otherCandidate}@example.test`,
      });
    await db
      .insert(applications)
      .values({
        id: otherApplication,
        workspaceId,
        candidateId: otherCandidate,
        jobId,
        currentStageId: stageId,
      });
    await db
      .insert(interviews)
      .values({
        workspaceId,
        applicationId: otherApplication,
        candidateId: otherCandidate,
        jobId,
        interviewerId: actors[0],
        scheduledAt: new Date(start),
        durationMins: 90,
        status: "scheduled",
        type: "screening",
        mode: "video",
      });
    expect((await getPooledBookingPage(token)).slots).toEqual([start]);
    expect(posts()).toHaveLength(0);
  });
  it("serializes concurrent confirmations into one provider write and one interview", async () => {
    const results = await Promise.all([
      confirmPooledBooking(token, start, "Asia/Manila"),
      confirmPooledBooking(token, start, "Asia/Manila"),
    ]);
    expect(results.some((result) => result.state === "confirmed")).toBe(true);
    expect(posts()).toHaveLength(1);
    expect(
      await db
        .select()
        .from(interviews)
        .where(eq(interviews.workspaceId, workspaceId)),
    ).toHaveLength(1);
    expect(
      (await confirmPooledBooking(token, later, "Asia/Manila")).state,
    ).toBe("confirmed");
    expect(posts()).toHaveLength(1);
  });
  it("keeps an uncertain write reserved, reconciles by signed metadata and never fails over", async () => {
    loseResponse = true;
    expect((await confirmPooledBooking(token, start, "UTC")).state).toBe(
      "review",
    );
    expect((await confirmPooledBooking(token, later, "UTC")).state).toBe(
      "review",
    );
    expect(posts()).toHaveLength(1);
    const [invitation] = await db
      .select()
      .from(automationBookingInvitations)
      .where(eq(automationBookingInvitations.id, invitationId));
    const hostIndex = events.indexOf(invitation.selectedEventId!);
    expect(
      await hasBookingReservation(db, {
        workspaceId,
        interviewerId: actors[hostIndex]!,
        when: new Date(start),
        durationMins: 30,
      }),
    ).toBe(true);
    await db
      .update(automationBookingInvitations)
      .set({ updatedAt: new Date(Date.now() - 120000) })
      .where(eq(automationBookingInvitations.id, invitationId));
    await reconcilePooledBookings();
    expect((await getPooledBookingPage(token)).state).toBe("confirmed");
    expect(posts()).toHaveLength(1);
  });
  it("leaves a no-match timeout unresolved, but allows retry after an explicit provider rejection", async () => {
    rejectWrite = true;
    await expect(confirmPooledBooking(token, start, "UTC")).rejects.toThrow(
      "could not confirm",
    );
    const [retryable] = await db
      .select()
      .from(automationBookingInvitations)
      .where(eq(automationBookingInvitations.id, invitationId));
    expect(retryable.bookingState).toBe("open");
    rejectWrite = false;
    loseResponse = true;
    await confirmPooledBooking(token, start, "UTC");
    created = null;
    await db
      .update(automationBookingInvitations)
      .set({ updatedAt: new Date(Date.now() - 120000) })
      .where(eq(automationBookingInvitations.id, invitationId));
    await reconcilePooledBookings();
    expect((await getPooledBookingPage(token)).state).toBe("review");
    expect(posts()).toHaveLength(2);
  });
  it("rejects tampered, expired and revoked invitations before looking up provider availability", async () => {
    await expect(
      getPooledBookingPage(
        token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"),
      ),
    ).rejects.toThrow("no longer available");
    await db
      .update(automationBookingInvitations)
      .set({ expiresAt: new Date(0) })
      .where(eq(automationBookingInvitations.id, invitationId));
    await expect(getPooledBookingPage(token)).rejects.toThrow(
      "no longer available",
    );
    await db
      .update(automationBookingInvitations)
      .set({ expiresAt: new Date(Date.now() + 86400000) })
      .where(eq(automationBookingInvitations.id, invitationId));
    await db
      .update(applications)
      .set({ status: "rejected" })
      .where(eq(applications.id, applicationId));
    await expect(getPooledBookingPage(token)).rejects.toThrow(
      "no longer available",
    );
    expect(provider.fetch).not.toHaveBeenCalled();
  });
  it("excludes a disconnected recruiter and validates pool duration against Cal.com", async () => {
    await db
      .update(personalCalConnections)
      .set({ enabled: false })
      .where(eq(personalCalConnections.id, connections[0]!));
    expect((await getPooledBookingPage(token)).slots).toEqual([start]);
    await expect(validateBookingPool(workspaceId, events)).rejects.toThrow(
      "active Cal.com",
    );
    await db
      .update(personalCalConnections)
      .set({ enabled: true })
      .where(eq(personalCalConnections.id, connections[0]!));
    await db
      .update(personalCalEvents)
      .set({ durationMins: 45 })
      .where(eq(personalCalEvents.id, events[0]!));
    await expect(validateBookingPool(workspaceId, events)).rejects.toThrow(
      "fixed interview duration",
    );
  });
  it("uses the least recently assigned available recruiter across applications", async () => {
    await confirmPooledBooking(token, start, "UTC");
    const firstKey = posts()[0]![0];
    // Remove the ATS conflict so both hosts are eligible and allocation, rather
    // than conflict filtering, determines the next host.
    await db
      .update(interviews)
      .set({ status: "canceled" })
      .where(eq(interviews.workspaceId, workspaceId));
    const nextApp = randomUUID(),
      nextCandidate = randomUUID(),
      nextInvitation = randomUUID();
    await db
      .insert(candidates)
      .values({
        id: nextCandidate,
        workspaceId,
        firstName: "Fictional",
        lastName: "Second",
        email: `${nextCandidate}@example.test`,
      });
    await db
      .insert(applications)
      .values({
        id: nextApp,
        workspaceId,
        candidateId: nextCandidate,
        jobId,
        currentStageId: stageId,
      });
    await db
      .insert(automationBookingInvitations)
      .values({
        id: nextInvitation,
        workspaceId,
        applicationId: nextApp,
        workflowId,
        stageId,
        eventIds: events,
        tokenSecret: "next-fixture",
        expiresAt: new Date(Date.now() + 86400000),
        definitionVersion: 1,
        durationMins: 30,
        locationFormat: "video",
      });
    await confirmPooledBooking(
      signBookingInvitation(nextInvitation, "next-fixture"),
      start,
      "UTC",
    );
    expect(posts()).toHaveLength(2);
    expect(posts()[1]![0]).not.toBe(firstKey);
  });
  it("reconciles cancellation without reopening the invitation for an accidental second booking", async () => {
    await confirmPooledBooking(token, start, "UTC");
    created!.status = "cancelled";
    const [invitation] = await db
      .select()
      .from(automationBookingInvitations)
      .where(eq(automationBookingInvitations.id, invitationId));
    await syncPersonalCalBooking(invitation.selectedEventId!, created!.uid);
    expect((await getPooledBookingPage(token)).state).toBe("canceled");
    await confirmPooledBooking(token, later, "UTC");
    expect(posts()).toHaveLength(1);
  });
});
