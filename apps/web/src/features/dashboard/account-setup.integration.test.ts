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
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";
import {
  db,
  organization,
  user,
  member,
  personalCalConnections,
  personalCalEvents,
  personalGoogleConnections,
} from "@harly/db";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  session: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.context,
  getWorkspaceContextOrNull: mocks.context,
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/storage", () => ({ storage: { read: mocks.read } }));
import { getSetupChecklist } from "./setup-checklist";
import { GET } from "@/app/api/account/avatar/route";

const integration =
  process.env.RUN_ACCOUNT_SETUP_INTEGRATION === "1" ? describe : describe.skip;
integration("personal scheduling checklist and private account avatars", () => {
  const workspaceId = `setup-${randomUUID()}`;
  const otherWorkspaceId = `setup-${randomUUID()}`;
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  const key = `workspaces/${workspaceId}/images/${randomUUID()}/avatar.jpg`;
  let seeded = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("eval")
    )
      throw new Error("Use the isolated local evaluation database.");
    seeded = true;
    await db
      .insert(organization)
      .values(
        [workspaceId, otherWorkspaceId].map((id) => ({
          id,
          slug: id,
          name: "Fictional setup test",
          createdAt: new Date(),
        })),
      );
    await db
      .insert(user)
      .values(
        userIds.map((id) => ({
          id,
          name: "Fictional Recruiter",
          email: `${id}@example.test`,
        })),
      );
    await db
      .insert(member)
      .values(
        userIds.map((userId, index) => ({
          id: randomUUID(),
          userId,
          organizationId: index === 2 ? otherWorkspaceId : workspaceId,
          createdAt: new Date(),
        })),
      );
  });
  beforeEach(async () => {
    mocks.context.mockResolvedValue({
      organization: { id: workspaceId },
      user: { id: userIds[0] },
      role: "owner",
    });
    mocks.session.mockResolvedValue({ user: { id: userIds[0] } });
    mocks.read.mockReset();
    await db
      .delete(personalGoogleConnections)
      .where(
        inArray(personalGoogleConnections.workspaceId, [
          workspaceId,
          otherWorkspaceId,
        ]),
      );
    await db
      .delete(personalCalConnections)
      .where(
        inArray(personalCalConnections.workspaceId, [
          workspaceId,
          otherWorkspaceId,
        ]),
      );
    await db.update(user).set({ image: null }).where(inArray(user.id, userIds));
  });
  afterAll(async () => {
    if (!seeded) return;
    await db
      .delete(organization)
      .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
    await db.delete(user).where(inArray(user.id, userIds));
  });
  const scheduling = async () =>
    (await getSetupChecklist()).items.some((item) => item.key === "scheduling");
  it("recognizes an active teammate's Google connection and ignores disabled connections", async () => {
    expect(await scheduling()).toBe(true);
    await db
      .insert(personalGoogleConnections)
      .values({
        workspaceId,
        userId: userIds[1]!,
        accountEmail: "fictional@example.test",
        calendarId: "primary",
        availabilityCalendarIds: ["primary"],
        refreshTokenCiphertext: "fictional",
      });
    expect(await scheduling()).toBe(false);
    await db
      .update(personalGoogleConnections)
      .set({ enabled: false })
      .where(eq(personalGoogleConnections.workspaceId, workspaceId));
    expect(await scheduling()).toBe(true);
  });
  it("ignores another workspace and a connection without active membership", async () => {
    await db
      .insert(personalGoogleConnections)
      .values(
        [otherWorkspaceId, workspaceId].map((workspaceId) => ({
          workspaceId,
          userId: userIds[2]!,
          accountEmail: "fictional@example.test",
          calendarId: "primary",
          availabilityCalendarIds: ["primary"],
          refreshTokenCiphertext: "fictional",
        })),
      );
    expect(await scheduling()).toBe(true);
  });
  it("requires the selected Cal.com event's webhook, not just an API key", async () => {
    const [connection] = await db
      .insert(personalCalConnections)
      .values({
        workspaceId,
        userId: userIds[1]!,
        calUserId: 42,
        username: "fictional",
        accountEmail: "fictional@example.test",
        apiKeyCiphertext: "fictional",
        defaultEventTypeId: 1,
      })
      .returning();
    expect(await scheduling()).toBe(true);
    await db
      .insert(personalCalEvents)
      .values({
        connectionId: connection!.id,
        eventTypeId: 1,
        title: "Fictional event",
        bookingUrl: "https://cal.com/fictional/test",
        durationMins: 30,
        webhookSecret: "fictional",
      });
    expect(await scheduling()).toBe(true);
    await db
      .update(personalCalEvents)
      .set({ webhookId: "fictional" })
      .where(eq(personalCalEvents.connectionId, connection!.id));
    expect(await scheduling()).toBe(false);
    await db
      .update(personalCalConnections)
      .set({ defaultEventTypeId: 2 })
      .where(eq(personalCalConnections.id, connection!.id));
    expect(await scheduling()).toBe(true);
  });
  function request(value = key) {
    return new NextRequest(
      `http://localhost/api/account/avatar?key=${encodeURIComponent(value)}`,
    );
  }
  async function image(owner = userIds[0]!) {
    await db
      .update(user)
      .set({ image: `https://storage.example.test/private/${key}` })
      .where(eq(user.id, owner));
    mocks.read.mockResolvedValue(
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "blue" },
      })
        .png()
        .toBuffer(),
    );
  }
  it("serves existing private avatar URLs as authenticated raster images", async () => {
    await image();
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      (await sharp(Buffer.from(await response.arrayBuffer())).metadata())
        .format,
    ).toBe("webp");
  });
  it("allows teammates to view a persisted staff avatar", async () => {
    await image(userIds[1]);
    expect((await GET(request())).status).toBe(200);
  });
  it("rejects anonymous users, nonmembers, unreferenced keys and document keys before reading storage", async () => {
    expect((await GET(request())).status).toBe(404);
    await image();
    mocks.session.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
    mocks.session.mockResolvedValue({ user: { id: userIds[2] } });
    expect((await GET(request())).status).toBe(404);
    expect((await GET(request(key.replace("images", "resumes")))).status).toBe(
      404,
    );
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not serve non-image content as an avatar", async () => {
    await image();
    mocks.read.mockResolvedValue(Buffer.from("not an image"));
    expect((await GET(request())).status).toBe(404);
  });
});
