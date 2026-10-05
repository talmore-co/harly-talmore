import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizedLinkedIn } from "@/features/talentsourcer/profile";
import { type CrmCandidate, educationSchema, workSchema } from "./contracts";

export function candidateValues(row: CrmCandidate) {
  const firstName = row.first_name?.trim() || ""; const lastName = row.last_name?.trim() || "";
  if (!firstName && !lastName) throw new Error("Candidate has no name.");
  const email = row.email?.trim().toLowerCase() || null;
  if (email && !z.email().safeParse(email).success) throw new Error("Candidate email is invalid.");
  return { firstName: firstName || lastName, lastName: firstName ? lastName : "", email, phone: row.contact_number || null, linkedinUrl: normalizedLinkedIn(row.linkedin), githubUrl: row.github || null, location: [row.city, row.state, row.country].filter(Boolean).join(", ") || null, address: row.address || null, headline: [row.position, row.current_organization].filter(Boolean).join(" at ") || null, summary: row.candidate_summary || null, skills: row.skill?.split(",").map(value => value.trim()).filter(Boolean) || [] };
}
function date(value: string | number | null | undefined) {
  if (!value || value === "0") return null;
  const parsed = new Date(typeof value === "number" || /^\d+$/.test(value) ? Number(value) * 1000 : value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 7) : null;
}
export function workValues(data: unknown) { return z.array(workSchema).parse(data).filter(row => row.title || row.work_company_name).map(row => ({ id: randomUUID(), title: row.title || "", company: row.work_company_name || "", location: row.work_location || null, description: row.work_description || null, current: row.is_currently_working, startDate: date(row.work_start_date), endDate: date(row.work_end_date) })); }
export function educationValues(data: unknown) { return z.array(educationSchema).parse(data).filter(row => row.institute_name).map(row => ({ id: randomUUID(), school: row.institute_name!, degree: row.educational_qualification || null, field: row.educational_specialization || null, description: row.education_description || null, startDate: date(row.education_start_date), endDate: date(row.education_end_date) })); }
