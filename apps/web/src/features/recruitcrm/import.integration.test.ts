import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { applications, candidates, candidateFiles, candidateNotes, db, emailOutbox, jobs, jobStages, mailThreads, member, organization, poolEntries, recruitCrmConnections as connections, recruitCrmImportBatches as batches, recruitCrmImportItems as items, user } from "@harly/db";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storage: { put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/ssrf", () => ({ safeFetchHttp: vi.fn() }));
import { getWorkspaceContext, type WorkspaceContext } from "@/features/workspaces/context";
import { safeFetchHttp } from "@/lib/ssrf";
import { storage } from "@/lib/storage";
import { assertCandidateContactAllowed } from "@/features/candidates/contact-restrictions";
import { disconnectRecruitCrm, previewRecruitCrm, queueRecruitCrmImport, recruitCrmBatchStatus, saveRecruitCrmConnection, fetchMoreRecruitCrm, queueAllRecruitCrm, recruitCrmProgress } from "./actions";
import { processRecruitCrmImports } from "./worker";
import { eraseRecruitCrmCandidate } from "./cleanup";
import { replyMailboxThreadAction } from "@/features/mailbox/actions";
import { discoverRecruitCrmPage } from "./discovery";

const integration = process.env.RUN_RECRUITCRM_INTEGRATION === "1" ? describe : describe.skip;
integration("Recruit CRM background imports", () => {
  let workspaceId: string, actorId: string, jobId: string, stageId: string, connectionId: string;
  let profile: Record<string, unknown>;
  const fetcher = vi.fn();
  beforeEach(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/harly_talmore_eval") throw new Error("Use isolated evaluation database");
    workspaceId = randomUUID(); actorId = randomUUID(); jobId = randomUUID(); stageId = randomUUID();
    profile = { slug: randomUUID(), first_name: "Fictional", last_name: "Prospect", email: null, linkedin: `https://www.linkedin.com/in/${randomUUID()}`, is_email_opted_out: "false" };
    await db.insert(user).values({ id: actorId, name: "Fictional Recruiter", email: `${actorId}@example.test` });
    await db.insert(organization).values({ id: workspaceId, slug: workspaceId, name: "Fictional CRM workspace", createdAt: new Date() });
    await db.insert(member).values({ id: randomUUID(), organizationId: workspaceId, userId: actorId, role: "owner", createdAt: new Date() });
    await db.insert(jobs).values({ id: jobId, workspaceId, title: "Fictional role", slug: jobId, status: "open", employmentType: "full_time", workplaceType: "onsite", description: "Fixture", createdById: actorId });
    await db.insert(jobStages).values({ id: stageId, workspaceId, jobId, name: "Screening", order: 0 });
    vi.mocked(getWorkspaceContext).mockResolvedValue({ roleKey: "owner", role: "owner", organization: { id: workspaceId }, user: { id: actorId } } as WorkspaceContext);
    fetcher.mockReset();
    fetcher.mockImplementation(async (input: string) => {
      const path = new URL(input).pathname;
      if (path.endsWith("/users")) return Response.json([{ id: 123, first_name: "Fictional" }]);
      if (path.endsWith("/work-history")) return Response.json([{ title: "Engineer", work_company_name: "Fictional Company", is_currently_working: true }]);
      if (path.endsWith("/education-history")) return Response.json([]);
      if (path.endsWith("/notes/search")) return Response.json([]);
      if (path.endsWith(`/candidates/${profile.slug}`)) return Response.json(profile);
      if (path.endsWith("/candidates") || path.endsWith("/candidates/search")) return Response.json({ data: [profile], next_page_url: null });
      throw new Error("Unexpected fixture request");
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await saveRecruitCrmConnection({ name: "Fictional CRM", token: "fixture-token" })).toMatchObject({ ok: true });
    [ { id: connectionId } ] = await db.select().from(connections).where(eq(connections.workspaceId, workspaceId));
    vi.mocked(safeFetchHttp).mockReset(); vi.mocked(storage.put).mockClear();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, actorId));
  });
  async function preview(pool = false, cv = false) {
    const result = await previewRecruitCrm({ connectionId, jobId: pool ? null : jobId, stageId: pool ? null : stageId, sourceKind: "search", includeNotes: false, includeCv: cv });
    if (!result.ok) throw new Error(result.error);
    return result;
  }
  async function run(result: Awaited<ReturnType<typeof preview>>) {
    expect(await queueRecruitCrmImport(result.batchId, result.rows.map(row => row.id))).toMatchObject({ ok: true });
    await processRecruitCrmImports();
    return recruitCrmBatchStatus(result.batchId);
  }
  it("imports email-less profiles silently and concurrent workers/retries create one application", async () => {
    const result = await preview();
    await queueRecruitCrmImport(result.batchId, result.rows.map(row => row.id));
    await Promise.all([processRecruitCrmImports(), processRecruitCrmImports()]);
    await processRecruitCrmImports();
    expect(await recruitCrmBatchStatus(result.batchId)).toMatchObject([{ status: "imported" }]);
    expect(await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId))).toHaveLength(1);
    expect(await db.select().from(applications).where(eq(applications.workspaceId, workspaceId))).toMatchObject([{ currentStageId: stageId, source: "recruitcrm" }]);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    await run(result);
    expect(await db.select().from(applications).where(eq(applications.workspaceId, workspaceId))).toHaveLength(1);
  });
  function pagedSource(emptyMiddle = false) {
    const people = Array.from({ length: 3 }, () => ({ ...profile, slug: randomUUID(), linkedin: `https://www.linkedin.com/in/${randomUUID()}` }));
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (/\/candidates(?:\/search)?$/.test(url.pathname)) {
        const page = Number(url.searchParams.get("page") || 1);
        return Response.json({ data: emptyMiddle && page === 2 ? [] : people.slice(page - 1, page), next_page_url: page < 3 ? "https://api.recruitcrm.io/v1/candidates?page=next" : null });
      }
      const person = people.find(row => url.pathname.endsWith(`/candidates/${row.slug}`));
      return person ? Response.json(person) : original(input);
    });
    return people;
  }
  it("appends pages to one preview and concurrent fetch-more requests do not skip a page", async () => {
    pagedSource(); const first = await preview();
    await Promise.all([fetchMoreRecruitCrm(first.batchId), fetchMoreRecruitCrm(first.batchId)]);
    const second = await recruitCrmBatchStatus(first.batchId);
    expect(second).toHaveLength(2); expect(second[0].id).toBe(first.rows[0].id);
    const third = await fetchMoreRecruitCrm(first.batchId);
    expect(third).toMatchObject({ ok: true, hasMore: false });
    expect(third.ok && third.rows).toHaveLength(3);
    expect(await db.select().from(batches).where(eq(batches.workspaceId, workspaceId))).toHaveLength(1);
  });
  it("queues all without fetching, freezes search filters, and imports unseen pages without another browser action", async () => {
    pagedSource();
    const first = await previewRecruitCrm({ connectionId, jobId, stageId, sourceKind: "search", field: "position", query: "Engineer", ownerId: "123", includeNotes: false, includeCv: false });
    if (!first.ok) throw new Error(first.error);
    const calls = fetcher.mock.calls.length;
    expect(await queueAllRecruitCrm(first.batchId)).toEqual({ ok: true });
    expect(fetcher.mock.calls).toHaveLength(calls);
    await Promise.all([discoverRecruitCrmPage(), discoverRecruitCrmPage()]);
    await queueAllRecruitCrm(first.batchId);
    await discoverRecruitCrmPage(); await discoverRecruitCrmPage();
    await processRecruitCrmImports(); await processRecruitCrmImports();
    const progress = await recruitCrmProgress(first.batchId);
    expect(progress).toMatchObject({ importAll: true, discoveryStatus: "done", total: 3, counts: { imported: 3 } });
    expect(await db.select().from(applications).where(eq(applications.workspaceId, workspaceId))).toHaveLength(3);
    const lists = fetcher.mock.calls.map(([url]) => new URL(url)).filter(url => url.pathname.endsWith("/candidates/search"));
    expect(lists.every(url => url.searchParams.get("position") === "Engineer" && url.searchParams.get("owner_id") === "123")).toBe(true);
    expect(lists.some(url => url.searchParams.get("limit") === "100")).toBe(true);
  });
  it("continues through empty non-final pages and recovers expired discovery leases", async () => {
    pagedSource(true); const first = await preview(); await queueAllRecruitCrm(first.batchId);
    await db.update(batches).set({ discoveryStatus: "processing", discoveryLeaseId: randomUUID(), discoveryLockedAt: new Date(0) }).where(eq(batches.id, first.batchId));
    await discoverRecruitCrmPage(); await discoverRecruitCrmPage();
    expect(await recruitCrmProgress(first.batchId)).toMatchObject({ discoveryStatus: "queued", total: 1 });
    await discoverRecruitCrmPage();
    expect(await recruitCrmProgress(first.batchId)).toMatchObject({ discoveryStatus: "done", total: 2 });
  });
  it("rate limiting preserves the discovery cursor and disconnect stops source discovery", async () => {
    pagedSource(); const first = await preview(); await queueAllRecruitCrm(first.batchId);
    await db.update(connections).set({ rateCount: 45, rateWindowAt: new Date() }).where(eq(connections.id, connectionId));
    await discoverRecruitCrmPage();
    const [paused] = await db.select().from(batches).where(eq(batches.id, first.batchId));
    expect(paused).toMatchObject({ discoveryStatus: "queued", nextPage: 1 });
    expect(paused.discoveryRetryAt.getTime()).toBeGreaterThan(Date.now());
    await disconnectRecruitCrm(connectionId);
    await db.update(batches).set({ discoveryRetryAt: new Date() }).where(eq(batches.id, first.batchId));
    await discoverRecruitCrmPage();
    expect(await recruitCrmProgress(first.batchId)).toMatchObject({ discoveryStatus: "failed", total: 1 });
  });
  it("imports to the pool without creating an application", async () => {
    expect(await run(await preview(true))).toMatchObject([{ status: "imported" }]);
    expect(await db.select().from(poolEntries).where(eq(poolEntries.workspaceId, workspaceId))).toHaveLength(1);
    expect(await db.select().from(applications).where(eq(applications.workspaceId, workspaceId))).toHaveLength(0);
  });
  it("erases both imported payloads and unsubmitted previews of the same candidate", async () => {
    await run(await preview());
    await preview();
    const [candidate] = await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId));
    await db.transaction(tx => eraseRecruitCrmCandidate(tx, workspaceId, candidate.id));
    expect(await db.select().from(items).where(eq(items.workspaceId, workspaceId))).toHaveLength(0);
  });
  it("clears expired payloads without letting old empty receipts block cleanup", async () => {
    const result = await preview(); await run(result);
    const [batch] = await db.select().from(batches).where(eq(batches.id, result.batchId));
    await db.insert(batches).values(Array.from({ length: 100 }, () => ({ ...batch, id: randomUUID(), expiresAt: new Date(0) })));
    await db.update(batches).set({ expiresAt: new Date(0) }).where(eq(batches.id, batch.id));
    await processRecruitCrmImports();
    const [item] = await db.select().from(items).where(eq(items.batchId, batch.id));
    expect(item).toMatchObject({ snapshot: {}, detail: {}, status: "imported" });
  });
  it("preserves recruiter edits and stages on repeat imports while enforcing opt-outs", async () => {
    await run(await preview());
    const [candidate] = await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId));
    await db.update(candidates).set({ firstName: "Edited", email: "fictional-optout@example.test" }).where(eq(candidates.id, candidate.id));
    profile.is_email_opted_out = "true";
    expect(await run(await preview())).toMatchObject([{ status: "imported", candidateId: candidate.id }]);
    const [saved] = await db.select().from(candidates).where(eq(candidates.id, candidate.id));
    expect(saved.firstName).toBe("Edited"); expect(saved.emailOptedOut).toBe(true);
    await expect(assertCandidateContactAllowed(workspaceId, { email: "fictional-optout@example.test" })).rejects.toThrow("opted out");
    const [thread] = await db.insert(mailThreads).values({ workspaceId, source: "smtp", candidateId: candidate.id, subject: "Fictional inquiry", normalizedSubject: "fictional inquiry", participantEmail: "old-fictional-address@example.test" }).returning();
    expect(await replyMailboxThreadAction({ threadId: thread.id, body: "Fictional reply", idempotencyKey: randomUUID() })).toMatchObject({ ok: false, error: expect.stringContaining("opted out") });
  });
  it("invalidates queued work when a connection is disconnected", async () => {
    const result = await preview(); await queueRecruitCrmImport(result.batchId, [result.rows[0].id]);
    await disconnectRecruitCrm(connectionId); await processRecruitCrmImports();
    expect(await recruitCrmBatchStatus(result.batchId)).toMatchObject([{ status: "failed" }]);
    expect(await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId))).toHaveLength(0);
  });
  it("rejects foreign-workspace connection IDs", async () => {
    expect(await previewRecruitCrm({ connectionId: randomUUID(), jobId, stageId, sourceKind: "search", includeCv: false, includeNotes: false })).toMatchObject({ ok: false });
  });
  it("imports attributed notes once and excludes unrelated source notes", async () => {
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input: string) => new URL(input).pathname.endsWith("/notes/search") ? Response.json([
      { id: 1, related_to: profile.slug, related_to_type: "candidate", description: "Fictional note", created_by: 123, created_on: "2026-01-01" },
      { id: 2, related_to: "someone-else", related_to_type: "candidate", description: "Unrelated note" },
    ]) : original(input));
    for (let n = 0; n < 2; n++) {
      const result = await previewRecruitCrm({ connectionId, jobId, stageId, sourceKind: "search", includeCv: false, includeNotes: true });
      if (!result.ok) throw new Error(result.error);
      expect(await run(result)).toMatchObject([{ status: "imported" }]);
    }
    const notes = await db.select().from(candidateNotes).where(eq(candidateNotes.workspaceId, workspaceId));
    expect(notes.filter(note => note.body.includes("Fictional note"))).toHaveLength(1);
    expect(notes.some(note => note.body.includes("Fictional (ID 123)"))).toBe(true);
    expect(notes.some(note => note.body.includes("Unrelated note"))).toBe(false);
  });
  it("keeps the successful candidate when CV transfer fails and retries only the CV", async () => {
    profile.resume = { filename: "Fictional CV.pdf", file_link: "https://files.example.test/cv.pdf" };
    vi.mocked(safeFetchHttp).mockResolvedValue(new Response("Unavailable", { status: 503 }));
    const result = await preview(false, true);
    expect(await run(result)).toMatchObject([{ status: "partial" }]);
    vi.mocked(safeFetchHttp).mockResolvedValue(new Response("%PDF-fixture"));
    expect(await run(result)).toMatchObject([{ status: "imported" }]);
    expect(await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId))).toHaveLength(1);
    expect(await db.select().from(candidateFiles).where(eq(candidateFiles.workspaceId, workspaceId))).toMatchObject([{ fileName: "Fictional CV.pdf" }]);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });
  it("rate limits queue work without marking it failed", async () => {
    const result = await preview();
    await db.update(connections).set({ rateCount: 45, rateWindowAt: new Date() }).where(eq(connections.id, connectionId));
    expect(await run(result)).toMatchObject([{ status: "queued" }]);
    const [item] = await db.select().from(items).where(eq(items.batchId, result.batchId));
    expect(item.retryAt.getTime()).toBeGreaterThan(Date.now());
    await db.update(connections).set({ rateCount: 0 }).where(eq(connections.id, connectionId));
    await db.update(items).set({ retryAt: new Date() }).where(eq(items.id, item.id));
    await processRecruitCrmImports();
    expect(await recruitCrmBatchStatus(result.batchId)).toMatchObject([{ status: "imported" }]);
  });
});
