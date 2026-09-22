import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  applications,
  candidates,
  candidateMerges,
  applicationMerges,
  candidateDuplicateDismissals,
  db,
  jobs,
  jobStages,
  activityEvents,
  applicationAnswers,
  applicationQuestions,
  aiEvaluations,
} from "@harly/db";
import {
  getRolePolicy,
  requirePermission,
} from "@/features/workspaces/permissions-server";

import { mergeFields, type MergeField } from "./merge-fields";
import { withConcurrencyRetry } from "@/lib/concurrent";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function mergeContext(write = false) {
  const context = await requirePermission(
    write ? "candidates:edit" : "candidates:view",
  );
  if (write) {
    await requirePermission("candidates:delete");
    await requirePermission("candidates:view");
  }
  const { scope } = await getRolePolicy(
    context.organization.id,
    context.roleKey,
  );
  if (
    scope.jobAccess !== "all" ||
    scope.departments.length ||
    scope.regions.length
  )
    throw new Error(
      "Duplicate review requires workspace-wide candidate access.",
    );
  return context;
}

async function pair(tx: Tx | typeof db, workspaceId: string, ids: string[]) {
  if (new Set(ids).size !== 2)
    throw new Error("Choose two different candidates.");
  const people = await tx
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        inArray(candidates.id, ids),
        isNull(candidates.deletedAt),
        isNull(candidates.anonymizedAt),
      ),
    );
  if (people.length !== 2)
    throw new Error(
      "Both candidates must be active and in this workspace. Refresh the review.",
    );
  const apps = await tx
    .select({
      application: applications,
      jobTitle: jobs.title,
      stageName: jobStages.name,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        inArray(applications.candidateId, ids),
      ),
    )
    .orderBy(applications.id);
  const ordered = ids.map((id) => people.find((person) => person.id === id)!);
  const appIds = apps.map((row) => row.application.id);
  const answers = appIds.length
    ? await tx
        .select({
          applicationId: applicationAnswers.applicationId,
          question: applicationQuestions.label,
          answer: applicationAnswers.answer,
        })
        .from(applicationAnswers)
        .innerJoin(
          applicationQuestions,
          eq(applicationQuestions.id, applicationAnswers.questionId),
        )
        .where(
          and(
            eq(applicationAnswers.workspaceId, workspaceId),
            inArray(applicationAnswers.applicationId, appIds),
          ),
        )
        .orderBy(applicationAnswers.id)
    : [];
  const evaluations = appIds.length
    ? await tx
        .select()
        .from(aiEvaluations)
        .where(
          and(
            eq(aiEvaluations.workspaceId, workspaceId),
            inArray(aiEvaluations.applicationId, appIds),
          ),
        )
        .orderBy(aiEvaluations.id)
    : [];
  const revision = createHash("sha256")
    .update(JSON.stringify({ people: ordered, apps, answers, evaluations }))
    .digest("hex");
  return {
    people: ordered,
    applications: apps,
    answers,
    evaluations,
    revision,
  };
}

export async function previewCandidateMerge(
  primaryId: string,
  sourceId: string,
) {
  const context = await mergeContext();
  const result = await pair(db, context.organization.id, [primaryId, sourceId]);
  return {
    ...result,
    applications: result.applications.map(({ application, ...rest }) => {
      const { inboundToken: _token, ...safe } = application;
      void _token;
      return { ...rest, application: safe };
    }),
  };
}

/** Catalog names are database-owned, quoted identifiers; values are always parameters. */
async function relatedTables(tx: Tx) {
  const rows = await tx.execute<{ table_name: string; column_name: string }>(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in ('candidate_id', 'application_id') order by table_name, column_name`,
  );
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const columns = result.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    result.set(row.table_name, columns);
  }
  return result;
}

export async function mergeCandidateRecords(input: {
  primaryId: string;
  sourceId: string;
  revision: string;
  fields: Partial<Record<MergeField, "primary" | "source">>;
  applicationChoices: Record<string, string>;
}) {
  const context = await mergeContext(true),
    workspaceId = context.organization.id;
  return withConcurrencyRetry(
    () =>
      db.transaction(async (tx) => {
        const tables = await relatedTables(tx);
        await tx.execute(sql`set local lock_timeout = '5s'`);
        await tx.execute(sql`set local statement_timeout = '10s'`);
        for (const id of [input.primaryId, input.sourceId].sort()) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`candidate-merge:${workspaceId}:${id}`}, 0))`,
          );
        }
        // These polymorphic/JSON references have no candidate foreign key. They
        // need brief table locks to prevent a new old-ID reference during merge.
        // NOWAIT releases all partial locks on contention rather than deadlocking
        // a booking/intake transaction that writes these tables in another order.
        await tx.execute(
          sql`lock table activity_events, document_associations, email_outbox, saved_signatures in share row exclusive mode nowait`,
        );
        await tx.execute(
          sql`select id from candidates where workspace_id = ${workspaceId} and id in (${input.primaryId}::uuid, ${input.sourceId}::uuid) order by id for update nowait`,
        );
        const lockedApps = await tx.execute<{ id: string }>(
          sql`select id from applications where workspace_id = ${workspaceId} and candidate_id in (${input.primaryId}::uuid, ${input.sourceId}::uuid) order by id for update nowait`,
        );
        // Lock existing children as well as parents: answer/evaluation updates can
        // leave their foreign keys unchanged and otherwise evade a parent lock.
        for (const [table, columns] of tables) {
          if (table === "applications") continue;
          const conditions = [];
          if (columns.has("candidate_id"))
            conditions.push(
              sql`candidate_id in (${input.primaryId}::uuid, ${input.sourceId}::uuid)`,
            );
          if (columns.has("application_id") && lockedApps.length)
            conditions.push(
              sql`application_id in (${sql.join(
                lockedApps.map(({ id }) => sql`${id}::uuid`),
                sql`, `,
              )})`,
            );
          if (!conditions.length) continue;
          const scope =
            table === "personal_cal_bookings"
              ? sql`true`
              : sql`workspace_id = ${workspaceId}`;
          await tx.execute(
            sql`select 1 from ${sql.identifier(table)} where ${scope} and (${sql.join(conditions, sql` or `)}) for update nowait`,
          );
        }
        const preview = await pair(tx, workspaceId, [
          input.primaryId,
          input.sourceId,
        ]);
        if (preview.revision !== input.revision)
          throw new Error(
            "These records changed. Close and reopen the review before merging.",
          );
        const [primary, source] = preview.people;
        const pendingDeletion = await tx.execute(
          sql`select id from candidate_deletion_jobs where workspace_id = ${workspaceId} and candidate_id in (${primary.id}::uuid, ${source.id}::uuid) and completed_at is null limit 1`,
        );
        if (pendingDeletion.length)
          throw new Error(
            "A candidate has an unfinished deletion request. Resolve it before merging.",
          );
        const pendingEvaluation = await tx.execute(
          sql`select id from evaluation_jobs where workspace_id = ${workspaceId} and candidate_id in (${primary.id}::uuid, ${source.id}::uuid) and status in ('pending', 'running', 'processing', 'failed') limit 1`,
        );
        if (pendingEvaluation.length)
          throw new Error(
            "A candidate has an AI evaluation in progress. Wait for it to finish before merging.",
          );

        const related: Record<string, unknown> = {};
        const appIds = preview.applications.map((row) => row.application.id);
        for (const [table, columns] of tables) {
          // Only conflicting values need an audit copy. Other records move intact.
          if (
            ![
              "application_answers",
              "ai_evaluations",
              "candidate_demographics",
              "candidate_tags",
              "candidate_referrals",
              "pool_entries",
            ].includes(table)
          )
            continue;
          const conditions = [];
          if (columns.has("candidate_id"))
            conditions.push(
              sql`candidate_id in (${primary.id}::uuid, ${source.id}::uuid)`,
            );
          if (columns.has("application_id") && appIds.length)
            conditions.push(
              sql`application_id in (${sql.join(
                appIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`,
            );
          if (!conditions.length) continue;
          related[table] = await tx.execute(
            sql`select * from ${sql.identifier(table)} where workspace_id = ${workspaceId} and (${sql.join(conditions, sql` or `)})`,
          );
        }

        const appMap = new Map<string, string>();
        const grouped = new Map<string, typeof preview.applications>();
        for (const app of preview.applications)
          grouped.set(app.application.jobId, [
            ...(grouped.get(app.application.jobId) ?? []),
            app,
          ]);
        for (const [jobId, rows] of grouped) {
          if (rows.length < 2) continue;
          const winner = rows.find(
            (row) => row.application.id === input.applicationChoices[jobId],
          );
          if (!winner)
            throw new Error(
              "Choose the application to retain for every shared job.",
            );
          for (const row of rows)
            if (row.application.id !== winner.application.id)
              appMap.set(row.application.id, winner.application.id);
        }

        const redirects = new Map([[source.id, primary.id], ...appMap]);
        for (const [oldId, newId] of redirects) {
          const sending = await tx.execute(
            sql`select id from email_outbox where workspace_id = ${workspaceId} and status = 'processing' and position(${JSON.stringify(oldId)} in payload::text) > 0 limit 1`,
          );
          if (sending.length)
            throw new Error(
              "A candidate email is being processed. Wait for it to finish before merging.",
            );
          await tx.execute(
            sql`update email_outbox set payload = replace(payload::text, ${JSON.stringify(oldId)}, ${JSON.stringify(newId)})::jsonb where workspace_id = ${workspaceId} and status = 'pending' and position(${JSON.stringify(oldId)} in payload::text) > 0`,
          );
        }

        // Preserve original values before resolving unique per-person/per-application records.
        const snapshot = {
          primary,
          source,
          applications: preview.applications.map(({ application, ...rest }) => {
            const { inboundToken: _token, ...safe } = application;
            void _token;
            return { ...rest, application: safe };
          }),
          related,
          applicationChoices: input.applicationChoices,
          fields: input.fields,
        };
        for (const [loser, winner] of appMap) {
          await tx.execute(
            sql`delete from document_associations old using document_associations kept where old.workspace_id = ${workspaceId} and kept.workspace_id = ${workspaceId} and old.target_type = 'application' and kept.target_type = 'application' and old.target_id = ${loser}::uuid and kept.target_id = ${winner}::uuid and old.document_id = kept.document_id`,
          );
          await tx.execute(
            sql`update document_associations set target_id = ${winner}::uuid where workspace_id = ${workspaceId} and target_type = 'application' and target_id = ${loser}::uuid`,
          );
          for (const table of ["application_answers", "ai_evaluations"]) {
            // Preserve the selected application's complete result set, including
            // unanswered/unscored values. The other set remains in the audit.
            await tx.execute(
              sql`delete from ${sql.identifier(table)} where workspace_id = ${workspaceId} and application_id = ${loser}::uuid`,
            );
          }
          const winnerCandidate = preview.applications.find(
            (row) => row.application.id === winner,
          )!.application.candidateId;
          for (const [table, columns] of tables) {
            if (
              !columns.has("application_id") ||
              table === "candidate_duplicate_dismissals"
            )
              continue;
            const candidateUpdate = columns.has("candidate_id")
              ? sql`, candidate_id = ${winnerCandidate}::uuid`
              : sql``;
            const scope =
              table === "personal_cal_bookings"
                ? sql`true`
                : sql`workspace_id = ${workspaceId}`;
            await tx.execute(
              sql`update ${sql.identifier(table)} set application_id = ${winner}::uuid ${candidateUpdate} where ${scope} and application_id = ${loser}::uuid`,
            );
          }
          await tx
            .update(activityEvents)
            .set({ entityId: winner })
            .where(
              and(
                eq(activityEvents.workspaceId, workspaceId),
                eq(activityEvents.entityType, "application"),
                eq(activityEvents.entityId, loser),
              ),
            );
          const original = preview.applications.find(
            (row) => row.application.id === loser,
          )!.application;
          await tx.insert(applicationMerges).values({
            workspaceId,
            sourceId: loser,
            applicationId: winner,
            inboundToken: original.inboundToken,
          });
          await tx
            .delete(applications)
            .where(
              and(
                eq(applications.workspaceId, workspaceId),
                eq(applications.id, loser),
              ),
            );
        }

        await tx.execute(
          sql`delete from candidate_demographics old using candidate_demographics kept where old.workspace_id = ${workspaceId} and kept.workspace_id = ${workspaceId} and old.candidate_id = ${source.id}::uuid and kept.candidate_id = ${primary.id}::uuid`,
        );
        await tx.execute(
          sql`delete from candidate_tags old using candidate_tags kept where old.workspace_id = ${workspaceId} and kept.workspace_id = ${workspaceId} and old.candidate_id = ${source.id}::uuid and kept.candidate_id = ${primary.id}::uuid and lower(old.label) = lower(kept.label)`,
        );
        await tx.execute(
          sql`delete from candidate_referrals old using candidate_referrals kept where old.workspace_id = ${workspaceId} and kept.workspace_id = ${workspaceId} and old.candidate_id = ${source.id}::uuid and kept.candidate_id = ${primary.id}::uuid and old.referred_by_id = kept.referred_by_id and old.job_id is not distinct from kept.job_id`,
        );
        await tx.execute(
          sql`delete from candidate_embeddings where workspace_id = ${workspaceId} and candidate_id in (${source.id}::uuid, ${primary.id}::uuid)`,
        );
        await tx.execute(
          sql`update pool_entries set removed_at = now() where workspace_id = ${workspaceId} and candidate_id = ${source.id}::uuid and removed_at is null and exists (select 1 from pool_entries where workspace_id = ${workspaceId} and candidate_id = ${primary.id}::uuid and removed_at is null)`,
        );
        // Existing portal sessions cannot inherit access to another person's applications.
        await tx.execute(
          sql`delete from candidate_portal_sessions where workspace_id = ${workspaceId} and candidate_id in (${source.id}::uuid, ${primary.id}::uuid)`,
        );
        await tx.execute(
          sql`delete from candidate_portal_magic_links where workspace_id = ${workspaceId} and lower(email) in (${primary.email?.toLowerCase() ?? null}, ${source.email?.toLowerCase() ?? null})`,
        );
        await tx
          .delete(candidateDuplicateDismissals)
          .where(
            and(
              eq(candidateDuplicateDismissals.workspaceId, workspaceId),
              sql`(${candidateDuplicateDismissals.candidateId} = ${source.id}::uuid or ${candidateDuplicateDismissals.otherCandidateId} = ${source.id}::uuid)`,
            ),
          );
        // Application-context foreign keys cascade candidate changes to offers/interviews.
        await tx
          .update(applications)
          .set({ candidateId: primary.id })
          .where(
            and(
              eq(applications.workspaceId, workspaceId),
              eq(applications.candidateId, source.id),
            ),
          );
        for (const [table, columns] of tables) {
          if (
            !columns.has("candidate_id") ||
            ["applications", "candidate_duplicate_dismissals"].includes(table)
          )
            continue;
          await tx.execute(
            sql`update ${sql.identifier(table)} set candidate_id = ${primary.id}::uuid where workspace_id = ${workspaceId} and candidate_id = ${source.id}::uuid`,
          );
        }
        await tx.execute(
          sql`delete from document_associations old using document_associations kept where old.workspace_id = ${workspaceId} and kept.workspace_id = ${workspaceId} and old.target_type = 'candidate' and kept.target_type = 'candidate' and old.target_id = ${source.id}::uuid and kept.target_id = ${primary.id}::uuid and old.document_id = kept.document_id`,
        );
        await tx.execute(
          sql`update document_associations set target_id = ${primary.id}::uuid where workspace_id = ${workspaceId} and target_type = 'candidate' and target_id = ${source.id}::uuid`,
        );
        await tx.execute(
          sql`update saved_signatures set owner_id = ${primary.id} where workspace_id = ${workspaceId} and owner_type in ('candidate', 'portal_candidate') and owner_id = ${source.id}`,
        );
        await tx
          .update(activityEvents)
          .set({ entityId: primary.id })
          .where(
            and(
              eq(activityEvents.workspaceId, workspaceId),
              eq(activityEvents.entityType, "candidate"),
              eq(activityEvents.entityId, source.id),
            ),
          );

        const fields: Record<string, unknown> = {};
        for (const key of mergeFields)
          fields[key] =
            input.fields[key] === "source"
              ? source[key]
              : input.fields[key] === "primary"
                ? primary[key]
                : (primary[key] ?? source[key]);
        const union = (a: unknown[], b: unknown[]) => [
          ...new Map(
            [...a, ...b].map((value) => [JSON.stringify(value), value]),
          ).values(),
        ];
        await tx
          .delete(candidates)
          .where(
            and(
              eq(candidates.workspaceId, workspaceId),
              eq(candidates.id, source.id),
            ),
          );
        await tx
          .update(candidates)
          .set({
            ...fields,
            skills: union(
              primary.skills as unknown[],
              source.skills as unknown[],
            ),
            educationEntries: union(
              primary.educationEntries,
              source.educationEntries,
            ) as typeof primary.educationEntries,
            experienceEntries: union(
              primary.experienceEntries,
              source.experienceEntries,
            ) as typeof primary.experienceEntries,
            updatedAt: new Date(),
          })
          .where(eq(candidates.id, primary.id));
        const [audit] = await tx
          .insert(candidateMerges)
          .values({
            workspaceId,
            sourceId: source.id,
            candidateId: primary.id,
            originalEmails: [
              primary.email?.toLowerCase() ?? "",
              source.email?.toLowerCase() ?? "",
            ],
            snapshot: JSON.parse(JSON.stringify(snapshot)),
            actorId: context.user.id,
          })
          .returning({ id: candidateMerges.id });
        await tx.insert(activityEvents).values({
          workspaceId,
          actorId: context.user.id,
          entityType: "candidate",
          entityId: primary.id,
          type: "candidate.merged",
          metadata: {
            mergeId: audit.id,
            sourceId: source.id,
            applicationChoices: input.applicationChoices,
          },
        });
        return { candidateId: primary.id, mergeId: audit.id };
      }),
    {
      isConflict: (error) => {
        let cause: unknown = error;
        for (
          let depth = 0;
          depth < 4 && cause && typeof cause === "object";
          depth++
        ) {
          if (
            "code" in cause &&
            ["55P03", "40P01", "40001"].includes(String(cause.code))
          )
            return true;
          cause = "cause" in cause ? cause.cause : null;
        }
        return false;
      },
    },
  );
}
