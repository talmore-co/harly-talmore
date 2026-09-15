import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  organization,
  candidates,
  candidateMessages,
  mailThreads,
  mailUnificationMigrations,
  workspaceSettings,
} from "@harly/db";
import { insertCanonicalMessage } from "@/lib/mail/canonical";
import { listCandidateCommunication } from "./communication-data";

const integration =
  process.env.RUN_CANDIDATE_COMMUNICATION_INTEGRATION === "1"
    ? describe
    : describe.skip;
integration("candidate communication read/write compatibility", () => {
  const workspaceId = `communication-test-${randomUUID()}`;
  const otherWorkspaceId = `communication-test-${randomUUID()}`;
  const candidateId = randomUUID();
  const otherCandidateId = randomUUID();
  const outsideCandidateId = randomUUID();
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
          name: "Fictional Mail Test",
          slug: id,
          createdAt: new Date(),
        })),
      );
    await db.insert(candidates).values([
      {
        id: candidateId,
        workspaceId,
        firstName: "Fictional",
        lastName: "Candidate",
        email: "candidate@example.test",
      },
      {
        id: otherCandidateId,
        workspaceId,
        firstName: "Another",
        lastName: "Candidate",
        email: "other@example.test",
      },
      {
        id: outsideCandidateId,
        workspaceId: otherWorkspaceId,
        firstName: "Outside",
        lastName: "Candidate",
        email: "outside@example.test",
      },
    ]);
  });
  beforeEach(async () => {
    await db
      .delete(candidateMessages)
      .where(
        inArray(candidateMessages.workspaceId, [workspaceId, otherWorkspaceId]),
      );
    await db
      .delete(mailThreads)
      .where(inArray(mailThreads.workspaceId, [workspaceId, otherWorkspaceId]));
    await db
      .delete(workspaceSettings)
      .where(
        inArray(workspaceSettings.organizationId, [
          workspaceId,
          otherWorkspaceId,
        ]),
      );
  });
  afterAll(async () => {
    if (seeded)
      await db
        .delete(organization)
        .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
  });
  function canonical(
    overrides: Partial<Parameters<typeof insertCanonicalMessage>[0]> = {},
  ) {
    return insertCanonicalMessage({
      workspaceId,
      candidateId,
      source: "provider",
      direction: "outbound",
      subject: "Fictional message",
      textBody: "Test correspondence only",
      fromEmail: "recruiter@example.test",
      toEmails: ["candidate@example.test"],
      receivedAt: new Date("2026-09-15T10:00:00Z"),
      messageId: `<${randomUUID()}@example.test>`,
      ...overrides,
    });
  }
  async function legacy(
    overrides: Partial<typeof candidateMessages.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(candidateMessages)
      .values({
        workspaceId,
        candidateId,
        toEmail: "candidate@example.test",
        fromEmail: "recruiter@example.test",
        subject: "Older correspondence",
        body: "Fictional legacy message",
        createdAt: new Date("2026-09-14T10:00:00Z"),
        ...overrides,
      })
      .returning();
    return row!;
  }
  it("shows a canonical outgoing message with the default disabled feature flag", async () => {
    const sent = await canonical();
    expect(
      await db
        .select()
        .from(candidateMessages)
        .where(eq(candidateMessages.candidateId, candidateId)),
    ).toHaveLength(0);
    expect(
      await listCandidateCommunication(workspaceId, candidateId),
    ).toMatchObject([
      {
        id: sent.messageId,
        threadId: sent.threadId,
        direction: "outbound",
        body: "Test correspondence only",
      },
    ]);
  });
  it("preserves legacy history alongside newer outgoing mail in chronological order", async () => {
    const old = await legacy({ status: "queued" });
    const sent = await canonical();
    const messages = await listCandidateCommunication(workspaceId, candidateId);
    expect(messages.map((message) => message.id)).toEqual([
      sent.messageId,
      old.id,
    ]);
    expect(messages[1]!.status).toBe("queued");
  });
  it("does not duplicate a dual-written message with the same provider identity", async () => {
    const messageId = `<${randomUUID()}@example.test>`;
    await legacy({ providerMessageId: messageId });
    const sent = await canonical({ messageId });
    expect(
      (await listCandidateCommunication(workspaceId, candidateId)).map(
        (message) => message.id,
      ),
    ).toEqual([sent.messageId]);
  });
  it("deduplicates migrated legacy messages that have no provider identity", async () => {
    const old = await legacy();
    const sent = await canonical();
    await db
      .insert(mailUnificationMigrations)
      .values({
        workspaceId,
        candidateMessageId: old.id,
        mailMessageId: sent.messageId,
        fingerprint: "fictional-fingerprint",
        status: "migrated",
      });
    expect(
      (await listCandidateCommunication(workspaceId, candidateId)).map(
        (message) => message.id,
      ),
    ).toEqual([sent.messageId]);
  });
  it("does not merge separate emails merely because their subjects and bodies match", async () => {
    const old = await legacy({
      subject: "Fictional message",
      body: "Test correspondence only",
    });
    const sent = await canonical();
    expect(
      (await listCandidateCommunication(workspaceId, candidateId)).map(
        (message) => message.id,
      ),
    ).toEqual([sent.messageId, old.id]);
  });
  it("keeps both canonical and legacy history scoped to the candidate and workspace", async () => {
    const own = await canonical();
    await canonical({ candidateId: otherCandidateId });
    await canonical({
      workspaceId: otherWorkspaceId,
      candidateId: outsideCandidateId,
    });
    await legacy({ candidateId: otherCandidateId });
    await legacy({
      workspaceId: otherWorkspaceId,
      candidateId: outsideCandidateId,
    });
    expect(
      (await listCandidateCommunication(workspaceId, candidateId)).map(
        (message) => message.id,
      ),
    ).toEqual([own.messageId]);
    expect(
      await listCandidateCommunication(otherWorkspaceId, candidateId),
    ).toEqual([]);
  });
  it("loads canonical attachments and respects the enabled canonical-only read mode", async () => {
    await legacy();
    const sent = await canonical({
      attachments: [
        {
          filename: "fictional.txt",
          contentType: "text/plain",
          content: Buffer.from("test"),
          storageKey: "fictional/test.txt",
        },
      ],
    });
    await db
      .insert(workspaceSettings)
      .values({ organizationId: workspaceId, mailUnificationEnabled: true });
    const messages = await listCandidateCommunication(workspaceId, candidateId);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.id).toBe(sent.messageId);
    expect(messages[0]!.attachments).toMatchObject([
      { filename: "fictional.txt", size: 4, storageKey: "fictional/test.txt" },
    ]);
  });
});
