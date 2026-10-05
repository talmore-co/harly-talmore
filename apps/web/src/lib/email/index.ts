import "server-only";

import type React from "react";

import {
  createEmailSender,
  type EmailSender,
  type EmailAttachment,
  type SendEmailResult,
} from "@harly/emails";

import { getWorkspaceEmailConfig } from "./config";
import { resolveSenderFromOverride } from "./sender-identity";
import { createLogger } from "@/lib/logger";
import { assertCandidateContactAllowed, ContactRestrictedError } from "@/features/candidates/contact-restrictions";

const log = createLogger("email");

export const emailSender = createEmailSender();

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
  messageId?: string;
  idempotencyKey?: string;
  attachments?: EmailAttachment[];
};

/** Send a platform-level email (welcome, invitations...) using the env-configured sender. */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!emailSender) {
    return;
  }

  try {
    await emailSender.send(options);
  } catch (error) {
    log.error(error, "[email] Failed to send email");
  }
}

/**
 * Resolve the email sender for a workspace: its own configured provider
 * (Resend or SMTP) when enabled, falling back to the platform's
 * RESEND_API_KEY/EMAIL_FROM env vars. Returns null when neither is available.
 *
 * `actorUserId`, when given, swaps the "From" for that recruiter's personal
 * virtual sender identity , but only once the workspace has configured its
 * own sending domain and that member has an identity provisioned. Otherwise
 * this is a no-op and behaves exactly as before.
 *
 * Sends are checked against candidate contact restrictions unless `purpose`
 * is "transactional": mail the recipient asked for or that is not addressed
 * to them as a candidate (sign-in links, verification codes, team invites).
 */
export type WorkspaceEmailPurpose = "candidate" | "transactional";

export async function getWorkspaceEmailSender(
  workspaceId: string,
  actorUserId?: string | null,
  purpose: WorkspaceEmailPurpose = "candidate",
): Promise<EmailSender | null> {
  const config = await getWorkspaceEmailConfig(workspaceId);
  const resolved = await resolveSenderFromOverride(workspaceId, actorUserId, config);
  const sender = createEmailSender(resolved);
  if (!sender || purpose === "transactional") return sender;
  return { ...sender, send: async options => { await assertCandidateContactAllowed(workspaceId, { email: options.to }); return sender.send(options); } };
}

/**
 * Send an email on behalf of a workspace, using its own provider when
 * configured or the platform default otherwise. Returns whether the email
 * was actually sent (false when no sender is configured, or on failure).
 * A contact restriction is not a delivery failure and is rethrown.
 */
export async function sendWorkspaceEmail(
  workspaceId: string,
  options: SendEmailOptions,
  actorUserId?: string | null,
  purpose: WorkspaceEmailPurpose = "candidate",
): Promise<SendEmailResult | false> {
  const sender = await getWorkspaceEmailSender(workspaceId, actorUserId, purpose);
  if (!sender) {
    return false;
  }

  try {
    return await sender.send(options);
  } catch (error) {
    if (error instanceof ContactRestrictedError) throw error;
    log.error(error, "[email] Failed to send workspace email");
    return false;
  }
}
