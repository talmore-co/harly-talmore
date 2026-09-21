import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  applications,
  automationBookingInvitations,
  candidates,
  db,
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
