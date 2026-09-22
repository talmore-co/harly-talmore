import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { activityEvents, applications, candidates, candidateNotes, db, emailOutbox, jobs, jobStages, member, organization, talentSourcerCandidateLinks, talentSourcerConnections, talentSourcerImportBatches, talentSourcerImportItems, user } from "@harly/db";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: vi.fn() }));
import { getWorkspaceContext, type WorkspaceContext } from "@/features/workspaces/context";
import { encryptSecret } from "@/lib/crypto";
import { checkTalentSourcer, connectTalentSourcer, disconnectTalentSourcer, getTalentSourcerStatus, previewTalentSourcerImport, submitTalentSourcerImport, talentSourcerImportOptions } from "./actions";
import { anonymizeCandidateForRetention } from "@/features/candidates/retention";
import { sendCandidateMessage, updateCandidateProfile } from "@/features/candidates/actions";

const integration = process.env.RUN_TALENTSOURCER_INTEGRATION === "1" ? describe : describe.skip;
integration("TalentSourcer import", () => {
  let workspaceId: string, actorId: string, jobId: string, stageId: string;
  let email: string | undefined;
  let linkedin: string;
  let externalId: string;
  let exportOrganization: string;
  let disposition: string;
  const fetcher = vi.fn();
  beforeEach(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/harly_talmore_eval") throw new Error("Use isolated evaluation database");
    workspaceId = randomUUID(); actorId = randomUUID(); jobId = randomUUID(); stageId = randomUUID(); externalId = randomUUID(); email = undefined; linkedin = `https://www.linkedin.com/in/fictional-${externalId}`; exportOrganization = "source-org"; disposition = "interested";
    await db.insert(user).values({ id: actorId, name: "Fictional Recruiter", email: `${actorId}@example.test` });
    await db.insert(organization).values({ id: workspaceId, slug: workspaceId, name: "Fictional sourcing workspace", createdAt: new Date() });
    await db.insert(member).values({ id: randomUUID(), organizationId: workspaceId, userId: actorId, role: "owner", createdAt: new Date() });
    await db.insert(jobs).values({ id: jobId, workspaceId, title: "Fictional role", slug: jobId, status: "open", employmentType: "full_time", workplaceType: "onsite", description: "Fixture", createdById: actorId });
    await db.insert(jobStages).values({ id: stageId, workspaceId, jobId, name: "Screening", order: 0 });
    await db.insert(talentSourcerConnections).values({ workspaceId, organizationId: "source-org", organizationName: "Fictional source", token: encryptSecret("fixture-token"), connectedById: actorId });
    vi.mocked(getWorkspaceContext).mockResolvedValue({ roleKey: "owner", role: "owner", organization: { id: workspaceId }, user: { id: actorId } } as WorkspaceContext);
    fetcher.mockReset();
    fetcher.mockImplementation(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      const second = new Headers(init.headers).get("Authorization") === "Bearer second-fixture-token";
      const sourceOrg = second ? "second-org" : "source-org";
      if (url.pathname.endsWith("/connection")) return Response.json({ organization: { id: sourceOrg, name: `Fictional ${sourceOrg}` }, scopes: ["projects:read", "shortlists:read", "candidates:read", "campaigns:read"] });
      if (url.pathname.endsWith("/projects")) return Response.json({ projects: [{ id: "source-project", title: sourceOrg }], continueCursor: "", isDone: true });
      if (url.pathname.endsWith("/shortlists") || url.pathname.endsWith("/campaigns")) return Response.json({ [url.pathname.split("/").at(-1)!]: [{ id: "source-list", projectId: "source-project", name: "Priority" }], continueCursor: "", isDone: true });
      if (url.pathname.endsWith("/candidates")) return Response.json({ page: [{ candidateId: externalId, organizationId: sourceOrg, projectId: "source-project", fullName: "Fictional Prospect", replyDisposition: disposition, replyDispositionSource: "manual" }], continueCursor: "", isDone: true });
      if (url.pathname.endsWith("/export")) return Response.json({ candidateId: externalId, organizationId: second ? sourceOrg : exportOrganization, profile: { fullName: "Fictional Prospect", linkedinUrl: second ? `${linkedin}-second` : linkedin, title: "Engineer" }, contacts: { selectedEmail: email }, privateContext: { notes: "Open to discussing this role." } });
      throw new Error("Unexpected request");
    });
    vi.stubGlobal("fetch", fetcher);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, actorId));
  });
  async function preview(kind: "shortlist" | "interested" = "shortlist", organizationId = "source-org") {
    const result = await previewTalentSourcerImport({ organizationId, jobId, stageId, projectId: "source-project", sourceId: "source-list", kind });
    if (!result.ok) throw new Error(result.error);
    return result;
  }
  async function submit(result: Awaited<ReturnType<typeof preview>>) {
    return submitTalentSourcerImport({ batchId: result.batchId, itemIds: result.rows.map(row => row.id) });
  }
  it("connects multiple workspaces and keeps equal external IDs scoped to their source", async () => {
    expect(await connectTalentSourcer("second-fixture-token")).toMatchObject({ ok: true });
    const status = await getTalentSourcerStatus();
    expect(status.connections).toHaveLength(2);
    expect(JSON.stringify(status)).not.toContain("token");
    const options = await talentSourcerImportOptions(jobId);
    expect(options.ok && options.connections).toHaveLength(2);
    expect(options.ok && options.projects).toEqual([]);
    const secondOptions = await talentSourcerImportOptions(jobId, undefined, "second-org");
    expect(secondOptions.ok && secondOptions.projects[0].title).toBe("second-org");
    await submit(await preview());
    await submit(await preview("shortlist", "second-org"));
    const linked = await db.select().from(talentSourcerCandidateLinks).where(eq(talentSourcerCandidateLinks.workspaceId, workspaceId));
    expect(linked).toHaveLength(2);
    expect(new Set(linked.map(row => row.candidateId)).size).toBe(2);
    expect(new Set(linked.map(row => row.externalCandidateId)).size).toBe(1);
  });
  it("disconnect and reconnect invalidate only the selected source's previews", async () => {
    await connectTalentSourcer("second-fixture-token");
    const first = await preview();
    const second = await preview("shortlist", "second-org");
    expect(await connectTalentSourcer("second-fixture-token", "source-org")).toMatchObject({ ok: false });
    await disconnectTalentSourcer("second-org");
    expect(await checkTalentSourcer("source-org")).toMatchObject({ ok: true });
    expect(await checkTalentSourcer("second-org")).toMatchObject({ ok: false });
    expect(await submit(second)).toMatchObject({ ok: false });
    expect(await submit(first)).toMatchObject({ ok: true, rows: [expect.objectContaining({ status: "imported" })] });
    await connectTalentSourcer("second-fixture-token");
    expect((await getTalentSourcerStatus()).connections).toHaveLength(2);
    expect(await submit(second)).toMatchObject({ ok: false });
  });
  it("rejects a source connection owned by another ATS workspace", async () => {
    const other = randomUUID();
    await db.insert(organization).values({ id: other, slug: other, name: "Fictional other tenant", createdAt: new Date() });
    try {
      await db.insert(talentSourcerConnections).values({ workspaceId: other, organizationId: "second-org", organizationName: "Other source", token: encryptSecret("second-fixture-token") });
      expect(await previewTalentSourcerImport({ organizationId: "second-org", jobId, stageId, projectId: "source-project", sourceId: "source-list", kind: "shortlist" })).toMatchObject({ ok: false });
      await disconnectTalentSourcer("second-org");
      const [untouched] = await db.select().from(talentSourcerConnections).where(eq(talentSourcerConnections.workspaceId, other));
      expect(untouched.token).not.toBeNull();
    } finally { await db.delete(organization).where(eq(organization.id, other)); }
  });
  it("imports an email-less candidate at the selected stage silently and deduplicates concurrent retries", async () => {
    const result = await preview();
    expect(result.rows[0].email).toBeNull();
    await Promise.all([submit(result), submit(result)]);
    const stored = await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId));
    expect(stored).toHaveLength(1); expect(stored[0].email).toBeNull();
    const apps = await db.select().from(applications).where(eq(applications.workspaceId, workspaceId));
    expect(apps).toHaveLength(1); expect(apps[0]).toMatchObject({ currentStageId: stageId, source: "talentsourcer" });
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.workspaceId, workspaceId))).toHaveLength(0);
    expect(await db.select().from(candidateNotes).where(eq(candidateNotes.workspaceId, workspaceId))).toHaveLength(1);
    expect((await preview()).rows[0].status).toBe("skipped");
  });
  it("matches a LinkedIn-only record without replacing saved profile data", async () => {
    const [existing] = await db.insert(candidates).values({ workspaceId, firstName: "Existing", lastName: "Name", linkedinUrl: linkedin }).returning();
    const result = await preview(); await submit(result);
    expect((await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId)))).toHaveLength(1);
    expect((await db.select().from(applications).where(eq(applications.workspaceId, workspaceId)))[0].candidateId).toBe(existing.id);
  });
  it("skips conflicting identities instead of merging them", async () => {
    email = "fictional@example.test";
    await db.insert(candidates).values([{ workspaceId, firstName: "One", lastName: "Person", email }, { workspaceId, firstName: "Another", lastName: "Person", linkedinUrl: linkedin }]);
    expect((await preview()).rows[0]).toMatchObject({ status: "skipped", reason: expect.stringContaining("Conflicting") });
  });
  it("rejects cross-organization exports and ignores non-interested campaign rows", async () => {
    exportOrganization = "other-org";
    expect((await preview()).rows[0].status).toBe("skipped");
    disposition = "neutral";
    expect((await preview("interested")).rows).toHaveLength(0);
  });
  it("invalidates previews after reconnect, expiration or job closure", async () => {
    const result = await preview();
    await db.update(talentSourcerConnections).set({ revision: randomUUID() }).where(eq(talentSourcerConnections.workspaceId, workspaceId));
    expect(await submit(result)).toMatchObject({ ok: false });
    const fresh = await preview();
    await db.update(talentSourcerImportBatches).set({ expiresAt: new Date(0) }).where(eq(talentSourcerImportBatches.id, fresh.batchId));
    expect(await submit(fresh)).toMatchObject({ ok: false });
    const last = await preview();
    await db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, jobId));
    const response = await submit(last);
    expect(response.ok && response.rows[0].status).toBe("failed");
  });
  it("keeps different email-less candidates separate and matches repeat imports by source ID", async () => {
    const first = await preview(); await submit(first);
    externalId = randomUUID(); linkedin = `https://www.linkedin.com/in/fictional-${externalId}`;
    const second = await preview(); await submit(second);
    expect(await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId))).toHaveLength(2);
    linkedin = `https://www.linkedin.com/in/changed-${externalId}`;
    expect((await preview()).rows[0].status).toBe("skipped");
  });
  it("does not accept another batch's selection or another actor's preview", async () => {
    const first = await preview();
    const second = await preview();
    const result = await submitTalentSourcerImport({ batchId: first.batchId, itemIds: second.rows.map(row => row.id) });
    expect(result.ok && result.rows[0].status).toBe("ready");
    expect(await db.select().from(applications).where(eq(applications.workspaceId, workspaceId))).toHaveLength(0);
    const current = await getWorkspaceContext();
    vi.mocked(getWorkspaceContext).mockResolvedValue({ ...current, user: { ...current.user, id: "different-user" } });
    expect(await submit(first)).toMatchObject({ ok: false });
  });
  it("blocks terminal stages and source lists from a different project", async () => {
    await db.update(jobStages).set({ name: "Hired" }).where(eq(jobStages.id, stageId));
    expect(await previewTalentSourcerImport({ organizationId: "source-org", jobId, stageId, projectId: "source-project", sourceId: "source-list", kind: "shortlist" })).toMatchObject({ ok: false });
    await db.update(jobStages).set({ name: "Screening" }).where(eq(jobStages.id, stageId));
    expect(await previewTalentSourcerImport({ organizationId: "source-org", jobId, stageId, projectId: "source-project", sourceId: "other-list", kind: "shortlist" })).toMatchObject({ ok: false });
  });
  it("erases source profile snapshots, private notes and identity provenance during retention", async () => {
    const result = await preview(); await submit(result);
    const [candidate] = await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId));
    await db.update(applications).set({ status: "rejected" }).where(eq(applications.candidateId, candidate.id));
    expect(await anonymizeCandidateForRetention(candidate.id, workspaceId, 12)).toBe("anonymized");
    expect(await db.select().from(talentSourcerCandidateLinks).where(eq(talentSourcerCandidateLinks.candidateId, candidate.id))).toHaveLength(0);
    expect(await db.select().from(talentSourcerImportItems).where(eq(talentSourcerImportItems.batchId, result.batchId))).toHaveLength(0);
    expect(await db.select().from(candidateNotes).where(eq(candidateNotes.candidateId, candidate.id))).toHaveLength(0);
    const events = await db.select().from(activityEvents).where(eq(activityEvents.workspaceId, workspaceId));
    expect(events.find(event => event.type === "application.imported")?.metadata).toEqual({ source: "talentsourcer", redacted: true });
  });
  it("allows adding an email later and rejects missing or stale email recipients before delivery", async () => {
    const result = await preview(); await submit(result);
    const [candidate] = await db.select().from(candidates).where(eq(candidates.workspaceId, workspaceId));
    const message = { candidateId: candidate.id, workspaceId, toEmail: "fictional@example.test", subject: "Fictional subject", body: "Fictional body" };
    expect(await sendCandidateMessage(message)).toMatchObject({ success: false, error: expect.stringContaining("Add an email") });
    const update = { candidateId: candidate.id, workspaceId, firstName: "Fictional", lastName: "", email: "fictional@example.test", phone: "", address: "", linkedinUrl: linkedin, githubUrl: "", websiteUrl: "", avatarUrl: "", headline: "", summary: "" };
    expect(await updateCandidateProfile(update)).toMatchObject({ success: true });
    expect(await sendCandidateMessage({ ...message, toEmail: "different@example.test" })).toMatchObject({ success: false, error: expect.stringContaining("email changed") });
    expect(await updateCandidateProfile({ ...update, email: "" })).toMatchObject({ success: true });
    expect((await db.select().from(candidates).where(eq(candidates.id, candidate.id)))[0].email).toBeNull();
  });
});
