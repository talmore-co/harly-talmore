import { createHash } from "node:crypto";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Hash only supplied identifiers. Never infer a missing phone country code. */
export function hashedMetaContact(contact: { email?: string | null; phone?: string | null }) {
  const result: { em?: string[]; ph?: string[] } = {};
  const email = contact.email?.trim().toLowerCase();
  if (email) result.em = [hash(email)];
  const phone = contact.phone?.trim();
  if (phone && /^\+[\d\s().-]+$/.test(phone)) {
    const digits = phone.replace(/\D/g, "");
    if (/^[1-9]\d{6,14}$/.test(digits)) result.ph = [hash(digits)];
  }
  return result;
}
