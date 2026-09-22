import type { ExportedCandidate } from "./client";
import { z } from "zod";

export function normalizedLinkedIn(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || !/^\/in\/[^/]+\/?$/.test(url.pathname)) return null;
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "").toLowerCase()}`;
  } catch { return null; }
}

export function importProfile(value: ExportedCandidate) {
  const profile = value.profile;
  const fullName = profile.fullName?.trim() || [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  if (!fullName) throw new Error("This candidate has no name. Add one in TalentSourcer first.");
  const email = value.contacts.selectedEmail?.trim().toLowerCase() || null;
  if (email && !z.email().safeParse(email).success) throw new Error("The selected TalentSourcer email is invalid. Correct it before importing.");
  const firstName = profile.firstName?.trim() || fullName.split(/\s+/)[0];
  const lastName = profile.lastName?.trim() || (fullName.startsWith(`${firstName} `) ? fullName.slice(firstName.length).trim() : "");
  return {
    firstName, lastName, email,
    phone: value.contacts.primaryPhone || null,
    linkedinUrl: normalizedLinkedIn(profile.linkedinUrl),
    location: profile.location || null,
    headline: profile.headline || [profile.title, profile.currentEmployer].filter(Boolean).join(" at ") || null,
    summary: profile.summary || null,
    skills: profile.skills || [],
  };
}
