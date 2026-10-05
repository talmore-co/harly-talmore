import "server-only";

import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { applications, db, jobHiringTeam, jobs } from "@harly/db";

import type { WorkspaceContext } from "@/features/workspaces/context";
import {
  isUnrestrictedRoleScope,
  type RoleScope,
} from "@/features/workspaces/permissions";
import {
  getRolePolicy,
  requirePermission,
} from "@/features/workspaces/permissions-server";

/**
 * SQL counterparts of `requireJobPermission` / `requireCandidatePermission`.
 *
 * List queries must apply role scope as a predicate so a scoped role sees the
 * same rows it could open one by one, without a per-row permission query.
 * Every helper returns `undefined` for an unrestricted scope, so owners,
 * admins and unscoped roles run exactly the query they ran before.
 */
export type RoleScopeActor = {
  workspaceId: string;
  userId: string;
  scope: RoleScope;
};

type JobScopeColumns = {
  id: AnyColumn;
  department: AnyColumn;
  jobLocationRegion: AnyColumn;
};

// Dedicated aliases keep the correlated subqueries unambiguous regardless of
// which tables the surrounding query already joins. They are only built when
// a restricted scope actually needs them, so importing this module has no
// schema side effects.
function buildScopeTables() {
  return {
    scopeJob: alias(jobs, "scope_job"),
    scopeApplication: alias(applications, "scope_application"),
    scopeTeam: alias(jobHiringTeam, "scope_team"),
  };
}
let cachedScopeTables: ReturnType<typeof buildScopeTables> | undefined;
const scopeTables = () => (cachedScopeTables ??= buildScopeTables());

const lowered = (values: string[]) => values.map((value) => value.toLowerCase());

/**
 * Scope predicate for a `jobs` row that is already part of the query. The
 * caller stays responsible for workspace and soft-delete filters on that row.
 */
export function jobScopeWhere(
  actor: RoleScopeActor,
  job: JobScopeColumns = jobs,
): SQL | undefined {
  const { scope } = actor;
  if (isUnrestrictedRoleScope(scope)) return undefined;
  const { scopeTeam } = scopeTables();
  return and(
    scope.departments.length
      ? inArray(sql`lower(${job.department})`, lowered(scope.departments))
      : undefined,
    scope.regions.length
      ? inArray(sql`lower(${job.jobLocationRegion})`, lowered(scope.regions))
      : undefined,
    scope.jobAccess === "assigned"
      ? exists(
          db
            .select({ id: scopeTeam.id })
            .from(scopeTeam)
            .where(
              and(
                eq(scopeTeam.workspaceId, actor.workspaceId),
                eq(scopeTeam.jobId, job.id),
                eq(scopeTeam.userId, actor.userId),
              ),
            ),
        )
      : undefined,
  );
}

/** True when `jobId` references a live job inside the actor's scope. */
export function jobIdInScope(
  actor: RoleScopeActor,
  jobId: AnyColumn | SQL,
): SQL | undefined {
  if (isUnrestrictedRoleScope(actor.scope)) return undefined;
  const { scopeJob } = scopeTables();
  return exists(
    db
      .select({ id: scopeJob.id })
      .from(scopeJob)
      .where(
        and(
          eq(scopeJob.id, jobId),
          eq(scopeJob.workspaceId, actor.workspaceId),
          isNull(scopeJob.deletedAt),
          jobScopeWhere(actor, scopeJob),
        ),
      ),
  );
}

/**
 * True when the candidate has at least one application on a live job inside
 * the actor's scope. Mirrors `requireCandidatePermission`: a scoped role has
 * no access to candidates without such an application, including candidates
 * that only exist in the talent pool.
 */
export function candidateIdInScope(
  actor: RoleScopeActor,
  candidateId: AnyColumn | SQL,
): SQL | undefined {
  if (isUnrestrictedRoleScope(actor.scope)) return undefined;
  const { scopeJob, scopeApplication } = scopeTables();
  return exists(
    db
      .select({ id: scopeApplication.id })
      .from(scopeApplication)
      .innerJoin(
        scopeJob,
        and(
          eq(scopeJob.id, scopeApplication.jobId),
          eq(scopeJob.workspaceId, actor.workspaceId),
          isNull(scopeJob.deletedAt),
        ),
      )
      .where(
        and(
          eq(scopeApplication.workspaceId, actor.workspaceId),
          eq(scopeApplication.candidateId, candidateId),
          jobScopeWhere(actor, scopeJob),
        ),
      ),
  );
}

/** Resolve the scope of an already authenticated workspace member. */
export async function resolveRoleScopeActor(
  context: WorkspaceContext,
): Promise<RoleScopeActor> {
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  return {
    workspaceId: context.organization.id,
    userId: context.user.id,
    scope: policy.scope,
  };
}

/**
 * Entry point for candidate list queries: require `candidates:view` and
 * return the scope the query has to apply.
 */
export async function requireCandidateListAccess() {
  const context = await requirePermission("candidates:view");
  const actor = await resolveRoleScopeActor(context);
  return {
    context,
    actor,
    restricted: !isUnrestrictedRoleScope(actor.scope),
  };
}
