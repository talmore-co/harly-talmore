import "server-only";
import { sql } from "drizzle-orm";
import { mailThreads } from "@harly/db";

/** Shared by the inbox filter and dashboard count. Reading a message is not a reply. */
export function threadNeedsReply() {
  return sql<boolean>`(select mm.direction from mail_messages mm
    where mm.thread_id = ${mailThreads.id} and mm.workspace_id = ${mailThreads.workspaceId}
    order by mm.received_at desc, mm.id desc limit 1) = 'inbound'`;
}
