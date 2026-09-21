import "server-only";

import { and, desc, eq, inArray, sql, getTableColumns } from "drizzle-orm";
import {
  db,
  candidateMessages,
  mailMessages,
  mailThreads,
  mailAttachments,
  mailUnificationMigrations,
  emailOutbox,
  user,
} from "@harly/db";
import { isMailUnificationEnabled } from "@/lib/mail/feature-flag";

type Attachment = {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
};
type CommunicationMessage = {
  id: string;
  threadId: string | null;
  applicationId: string | null;
  direction: "inbound" | "outbound";
  transport: typeof mailThreads.$inferSelect.source;
  subject: string;
  body: string;
  toEmail: string;
  fromEmail: string | null;
  status: "sent" | "queued" | "failed";
  read: boolean;
  authorName: string | null;
  origin: "member" | "system" | "automation" | null;
  attachments: Attachment[];
  createdAt: string;
};

/** Both send paths write canonical messages, even before mail unification is enabled. */
export async function listCandidateCommunication(
  workspaceId: string,
  candidateId: string,
) {
  const unified = await isMailUnificationEnabled(workspaceId);
  const canonical = await db
    .select({
      id: mailMessages.id,
      messageId: mailMessages.messageId,
      direction: mailMessages.direction,
      subject: mailMessages.subject,
      body: mailMessages.textBody,
      toEmails: mailMessages.toEmails,
      fromEmail: mailMessages.fromEmail,
      source: mailThreads.source,
      createdAt: mailMessages.receivedAt,
      threadId: mailMessages.threadId,
      applicationId: mailMessages.applicationId,
      readAt: mailMessages.readAt,
      authorName: user.name,
      authorId: mailMessages.authorId,
      origin: mailMessages.origin,
      outboxKind: emailOutbox.kind,
    })
    .from(mailMessages)
    .leftJoin(
      emailOutbox,
      and(
        eq(emailOutbox.workspaceId, workspaceId),
        sql`${mailMessages.messageId} = '<' || ${emailOutbox.id}::text || '@harly.local>'`,
      ),
    )
    .leftJoin(
      user,
      eq(
        user.id,
        sql`coalesce(${mailMessages.authorId}, ${emailOutbox.actorId})`,
      ),
    )
    .innerJoin(
      mailThreads,
      and(
        eq(mailThreads.id, mailMessages.threadId),
        eq(mailThreads.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(mailMessages.workspaceId, workspaceId),
        eq(mailMessages.candidateId, candidateId),
      ),
    )
    .orderBy(desc(mailMessages.receivedAt));

  const canonicalIds = canonical.map((message) => message.id);
  const attachments = canonicalIds.length
    ? await db
        .select({
          messageId: mailAttachments.messageId,
          filename: mailAttachments.filename,
          contentType: mailAttachments.contentType,
          size: mailAttachments.size,
          storageKey: mailAttachments.storageKey,
        })
        .from(mailAttachments)
        .where(
          and(
            eq(mailAttachments.workspaceId, workspaceId),
            inArray(mailAttachments.messageId, canonicalIds),
          ),
        )
    : [];
  const attachmentsByMessage = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const current = attachmentsByMessage.get(attachment.messageId) ?? [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.messageId, current);
  }

  const messages: CommunicationMessage[] = canonical.map((message) => ({
    id: message.id,
    threadId: message.threadId,
    applicationId: message.applicationId,
    direction: message.direction,
    transport: message.source,
    subject: message.subject,
    body: message.body,
    toEmail: Array.isArray(message.toEmails)
      ? String(message.toEmails[0] ?? "")
      : "",
    fromEmail: message.fromEmail,
    status: "sent",
    read: message.readAt !== null,
    authorName: message.authorName,
    origin:
      message.origin ??
      (message.outboxKind
        ? message.outboxKind.startsWith("automation.")
          ? "automation"
          : "system"
        : message.authorId
          ? "member"
          : null),
    attachments: attachmentsByMessage.get(message.id) ?? [],
    createdAt: message.createdAt.toISOString(),
  }));
  const legacy = await db
    .select({ ...getTableColumns(candidateMessages), authorName: user.name })
    .from(candidateMessages)
    .leftJoin(user, eq(user.id, candidateMessages.authorId))
    .where(
      and(
        eq(candidateMessages.workspaceId, workspaceId),
        eq(candidateMessages.candidateId, candidateId),
      ),
    )
    .orderBy(desc(candidateMessages.createdAt));
  const mappings =
    canonicalIds.length && legacy.length
      ? await db
          .select({
            legacyId: mailUnificationMigrations.candidateMessageId,
            canonicalId: mailUnificationMigrations.mailMessageId,
          })
          .from(mailUnificationMigrations)
          .where(
            and(
              eq(mailUnificationMigrations.workspaceId, workspaceId),
              inArray(mailUnificationMigrations.mailMessageId, canonicalIds),
              inArray(
                mailUnificationMigrations.candidateMessageId,
                legacy.map((message) => message.id),
              ),
              eq(mailUnificationMigrations.status, "migrated"),
            ),
          )
      : [];
  const migratedIds = new Set(mappings.map((mapping) => mapping.legacyId));
  const legacyById = new Map(legacy.map((message) => [message.id, message]));
  const legacyByProvider = new Map(
    legacy
      .filter((message) => message.providerMessageId)
      .map((message) => [message.providerMessageId, message]),
  );
  const migratedByCanonical = new Map(
    mappings.map((mapping) => [
      mapping.canonicalId,
      legacyById.get(mapping.legacyId),
    ]),
  );
  for (const message of messages) {
    if (message.origin || message.direction === "inbound") continue;
    const original =
      migratedByCanonical.get(message.id) ??
      legacyByProvider.get(
        canonical.find((row) => row.id === message.id)?.messageId ?? "",
      );
    if (original?.authorId) {
      message.authorName = original.authorName;
      message.origin = "member";
    }
  }
  if (unified) return messages;
  const providerIds = new Set(
    canonical.map((message) => message.messageId).filter(Boolean),
  );
  for (const message of legacy) {
    if (
      migratedIds.has(message.id) ||
      (message.providerMessageId && providerIds.has(message.providerMessageId))
    )
      continue;
    messages.push({
      id: message.id,
      threadId: null,
      applicationId: message.applicationId,
      direction: message.direction,
      transport: "provider",
      subject: message.subject,
      body: message.body,
      toEmail: message.toEmail,
      fromEmail: message.fromEmail,
      status: message.status,
      read: message.readAt !== null,
      authorName: message.authorName,
      origin: message.authorId ? "member" : null,
      attachments: Array.isArray(message.attachments)
        ? (message.attachments as Attachment[])
        : [],
      createdAt: message.createdAt.toISOString(),
    });
  }
  return messages.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}
