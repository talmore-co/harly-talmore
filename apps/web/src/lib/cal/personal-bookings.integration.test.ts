import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  interviews,
  jobs,
  jobStages,
  member,
  organization,
  personalCalBookings,
  personalCalConnections,
  personalCalEvents,
  user,
} from "@harly/db";
const mocks = vi.hoisted(() => ({
  booking: vi.fn(),
  publish: vi.fn(),
  emit: vi.fn(),
}));
vi.mock("./personal-client", async (original) => ({
  ...(await original<typeof import("./personal-client")>()),
  getPersonalCalBooking: mocks.booking,
}));
vi.mock("./personal", async (original) => ({
  ...(await original<typeof import("./personal")>()),
  personalCalApiKey: () => "fictional-key",
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn().mockResolvedValue(null),
  publishPersistedDomainEvents: mocks.publish,
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: mocks.emit }));
import { syncPersonalCalBooking } from "./personal-bookings";
import { signCalBookingReference } from "./booking-reference";
import type { PersonalCalBooking } from "./personal-client";

const integration =
  process.env.RUN_PERSONAL_CAL_INTEGRATION === "1" ? describe : describe.skip;
integration("personal Cal.com booking database integration", () => {
  const workspaceId = `cal-test-${randomUUID()}`;
  const userId = `cal-user-${randomUUID()}`;
  const connectionId = randomUUID();
  const subscriptionId = randomUUID();
  const appIds = [randomUUID(), randomUUID()];
  let booking: PersonalCalBooking;
  let seeded = false;
  const history = new Map<string, PersonalCalBooking>();
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("eval")
    )
      throw new Error("Use the isolated local evaluation database.");
    seeded = true;
    await db.insert(organization).values({
      id: workspaceId,
      name: "Fictional Cal Test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: userId,
      name: "Fictional Recruiter",
      email: `${userId}@example.test`,
    });
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: workspaceId,
      userId,
      createdAt: new Date(),
    });
    const [candidate] = await db
      .insert(candidates)
      .values({
        workspaceId,
        firstName: "Fictional",
        lastName: "Candidate",
        email: "fictional@example.test",
      })
      .returning();
    for (const id of appIds) {
      const [job] = await db
        .insert(jobs)
        .values({
          workspaceId,
          createdById: userId,
          title: "Fictional Role",
          slug: id,
          employmentType: "full_time",
          workplaceType: "remote",
          description: "Test only",
        })
        .returning();
      const [stage] = await db
        .insert(jobStages)
        .values({ workspaceId, jobId: job!.id, name: "Applied", order: 0 })
        .returning();
      await db.insert(applications).values({
        id,
        workspaceId,
        candidateId: candidate!.id,
        jobId: job!.id,
        currentStageId: stage!.id,
      });
    }
    await db.insert(personalCalConnections).values({
      id: connectionId,
      workspaceId,
      userId,
      calUserId: 77,
      username: "fictional",
      accountEmail: "recruiter@example.test",
    });
    await db.insert(personalCalEvents).values({
      id: subscriptionId,
      connectionId,
      eventTypeId: 12,
      title: "Screening",
      bookingUrl: "https://cal.com/fictional/screen",
      durationMins: 30,
      webhookId: "fictional-hook",
      webhookSecret: "fictional-secret",
    });
  });
  beforeEach(async () => {
    await db
      .delete(personalCalBookings)
      .where(eq(personalCalBookings.connectionId, connectionId));
    await db.delete(interviews).where(eq(interviews.workspaceId, workspaceId));
    await db
      .update(personalCalConnections)
      .set({ enabled: true })
      .where(eq(personalCalConnections.id, connectionId));
    booking = {
      uid: "booking-a",
      title: "Fictional screening",
      status: "accepted",
      start: "2026-12-01T10:00:00Z",
      end: "2026-12-01T10:30:00Z",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
      eventTypeId: 12,
      hosts: [{ id: 77 }],
      attendees: [
        { name: "Fictional Candidate", email: "fictional@example.test" },
      ],
      metadata: {
        harlyBookingRef: signCalBookingReference(
          appIds[0]!,
          subscriptionId,
          "fictional-secret",
        ),
      },
    };
    history.clear();
    mocks.booking
      .mockReset()
      .mockImplementation(
        async (_key: string, uid: string) => history.get(uid) ?? booking,
      );
  });
  afterAll(async () => {
    if (!seeded) return;
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });
  it("imports once under the signed application and recruiter without Google ownership", async () => {
    await Promise.all([
      syncPersonalCalBooking(subscriptionId, booking.uid),
      syncPersonalCalBooking(subscriptionId, booking.uid),
    ]);
    const rows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      applicationId: appIds[0],
      interviewerId: userId,
      calConnectionId: connectionId,
      source: "cal.com-personal",
      gcalEventId: null,
    });
  });
  it("does not pick the newest application using email; requires manual matching", async () => {
    booking.metadata = {};
    expect(await syncPersonalCalBooking(subscriptionId, booking.uid)).toEqual({
      matched: false,
    });
    expect(
      await db
        .select()
        .from(interviews)
        .where(eq(interviews.workspaceId, workspaceId)),
    ).toHaveLength(0);
    await syncPersonalCalBooking(subscriptionId, booking.uid, appIds[1]);
    expect(
      (
        await db
          .select()
          .from(interviews)
          .where(eq(interviews.workspaceId, workspaceId))
      )[0]!.applicationId,
    ).toBe(appIds[1]);
  });
  it("keeps interview identity through rescheduling and cancellation, ignoring stale updates", async () => {
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    const [initial] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.workspaceId, workspaceId));
    history.set(booking.uid, {
      ...booking,
      status: "cancelled",
      rescheduledToUid: "booking-b",
    });
    booking = {
      ...booking,
      uid: "booking-b",
      rescheduledFromUid: "booking-a",
      start: "2026-12-02T10:00:00Z",
      end: "2026-12-02T10:30:00Z",
      updatedAt: "2026-10-02T10:00:00Z",
    };
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    const stale = { ...booking };
    booking = {
      ...booking,
      status: "cancelled",
      updatedAt: "2026-10-03T10:00:00Z",
    };
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    booking = stale;
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    const rows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: initial!.id,
      status: "canceled",
      calBookingUid: "booking-b",
    });
  });
  it("keeps one interview when the second reschedule arrives before the first", async () => {
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    history.set("booking-a", {
      ...booking,
      status: "cancelled",
      rescheduledToUid: "booking-b",
    });
    history.set("booking-b", {
      ...booking,
      uid: "booking-b",
      status: "cancelled",
      rescheduledFromUid: "booking-a",
      rescheduledToUid: "booking-c",
    });
    booking = {
      ...booking,
      uid: "booking-c",
      rescheduledFromUid: "booking-b",
      updatedAt: "2026-10-03T10:00:00Z",
    };
    await syncPersonalCalBooking(subscriptionId, "booking-c");
    await syncPersonalCalBooking(subscriptionId, "booking-a");
    const rows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.calBookingUid).toBe("booking-c");
  });
  it("shows one unmatched item when an unreferenced booking is rescheduled", async () => {
    booking.metadata = {};
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    history.set("booking-a", {
      ...booking,
      status: "cancelled",
      rescheduledToUid: "booking-b",
    });
    booking = {
      ...booking,
      uid: "booking-b",
      rescheduledFromUid: "booking-a",
      updatedAt: "2026-10-02T10:00:00Z",
    };
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    const inbox = await db
      .select()
      .from(personalCalBookings)
      .where(eq(personalCalBookings.connectionId, connectionId));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.bookingUid).toBe("booking-b");
  });
  it("rejects a booking belonging to another host or event", async () => {
    booking.hosts = [{ id: 88 }];
    await expect(
      syncPersonalCalBooking(subscriptionId, booking.uid),
    ).rejects.toThrow("does not belong");
    booking.hosts = [{ id: 77 }];
    booking.eventTypeId = 99;
    await expect(
      syncPersonalCalBooking(subscriptionId, booking.uid),
    ).rejects.toThrow("does not belong");
  });
  it("rejects disabled connections before fetching provider data", async () => {
    await db
      .update(personalCalConnections)
      .set({ enabled: false })
      .where(eq(personalCalConnections.id, connectionId));
    await expect(
      syncPersonalCalBooking(subscriptionId, booking.uid),
    ).rejects.toThrow("not available");
    expect(mocks.booking).not.toHaveBeenCalled();
  });
  it("holds an overlapping booking for attention instead of bypassing Harly's interview block", async () => {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, appIds[1]!));
    const [conflict] = await db
      .insert(interviews)
      .values({
        workspaceId,
        applicationId: application!.id,
        candidateId: application!.candidateId,
        jobId: application!.jobId,
        interviewerId: userId,
        type: "screening",
        mode: "phone",
        scheduledAt: new Date(booking.start),
        durationMins: 30,
      })
      .returning();
    expect(await syncPersonalCalBooking(subscriptionId, booking.uid)).toEqual({
      matched: false,
    });
    const [inbox] = await db
      .select()
      .from(personalCalBookings)
      .where(eq(personalCalBookings.connectionId, connectionId));
    expect(inbox!.reason).toContain("overlapping Harly interview");
    expect(inbox!.applicationId).toBe(appIds[0]);
    expect(
      await db
        .select()
        .from(interviews)
        .where(eq(interviews.workspaceId, workspaceId)),
    ).toHaveLength(1);
    await db.delete(interviews).where(eq(interviews.id, conflict!.id));
    booking.metadata = {};
    expect(await syncPersonalCalBooking(subscriptionId, booking.uid)).toEqual({
      matched: true,
    });
  });
  it("preserves an established application while a booking awaits confirmation", async () => {
    await syncPersonalCalBooking(subscriptionId, booking.uid);
    booking = {
      ...booking,
      status: "pending",
      metadata: {},
      updatedAt: "2026-10-02T10:00:00Z",
    };
    expect(await syncPersonalCalBooking(subscriptionId, booking.uid)).toEqual({
      matched: false,
    });
    const [held] = await db
      .select()
      .from(personalCalBookings)
      .where(eq(personalCalBookings.connectionId, connectionId));
    expect(held).toMatchObject({
      applicationId: appIds[0],
      interviewId: expect.any(String),
      reason: expect.stringContaining("awaiting confirmation"),
    });
    booking = {
      ...booking,
      status: "accepted",
      updatedAt: "2026-10-03T10:00:00Z",
    };
    expect(await syncPersonalCalBooking(subscriptionId, booking.uid)).toEqual({
      matched: true,
    });
    const rows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.applicationId).toBe(appIds[0]);
  });
  it("does not import a signed reference for an unavailable application", async () => {
    booking.metadata = {
      harlyBookingRef: signCalBookingReference(
        randomUUID(),
        subscriptionId,
        "fictional-secret",
      ),
    };
    expect(await syncPersonalCalBooking(subscriptionId, booking.uid)).toEqual({
      matched: false,
    });
    expect(
      await db
        .select()
        .from(interviews)
        .where(eq(interviews.workspaceId, workspaceId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(personalCalBookings)
        .where(eq(personalCalBookings.connectionId, connectionId)),
    ).toHaveLength(0);
  });
});
