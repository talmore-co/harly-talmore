import { z } from "zod";

const text = z.string().nullish();
export const crmId = z.union([z.string(), z.number()]).transform(String);
export const crmFlag = z.union([z.boolean(), z.string(), z.number()]).nullish().transform(value => value === true || value === 1 || value === "1" || value === "true");
export const candidateSchema = z.object({
  slug: z.string().min(1), first_name: text, last_name: text, email: text, contact_number: text,
  linkedin: text, github: text, position: text, current_organization: text, city: text, state: text, country: text, address: text,
  candidate_summary: text, skill: text, source: text, resource_url: text,
  resume: z.union([z.string(), z.object({ filename: text, file_link: text })]).nullish(),
  is_email_opted_out: crmFlag, status_label: text, off_limit_status_id: z.union([z.string(), z.number()]).nullish(),
  off_limit_reason: text, off_limit_end_date: text,
  custom_fields: z.array(z.object({ field_name: text, value: z.unknown().optional() })).nullish(),
});
export type CrmCandidate = z.infer<typeof candidateSchema>;
export const userSchema = z.object({ id: crmId, first_name: text, last_name: text });
export const jobSchema = z.object({ slug: z.string(), name: z.string() });
export const noteSchema = z.object({ id: crmId, related_to: text, related_to_type: text, description: text, created_on: text, created_by: crmId.nullish(), associated_candidates: z.array(z.string()).nullish() });
export const workSchema = z.object({ title: text, work_company_name: text, work_location: text, work_description: text, is_currently_working: crmFlag, work_start_date: z.union([z.string(), z.number()]).nullish(), work_end_date: z.union([z.string(), z.number()]).nullish() });
export const educationSchema = z.object({ institute_name: text, educational_qualification: text, educational_specialization: text, education_description: text, education_start_date: z.union([z.string(), z.number()]).nullish(), education_end_date: z.union([z.string(), z.number()]).nullish() });
export function pageSchema<T>(row: z.ZodType<T>) {
  return z.union([z.array(row).transform(data => ({ data, hasMore: false })), z.object({ data: z.array(row), next_page_url: z.string().nullish() }).transform(result => ({ data: result.data, hasMore: Boolean(result.next_page_url && result.next_page_url !== "null") }))]);
}
export function restrictions(profile: CrmCandidate) {
  const label = profile.status_label?.trim().toLowerCase();
  const statusId = profile.off_limit_status_id;
  const offLimits = Boolean((statusId != null && statusId !== 0 && statusId !== "0" && statusId !== "") || profile.off_limit_reason || (label && !["available", "not off limit", "none"].includes(label)));
  const date = profile.off_limit_end_date ? new Date(profile.off_limit_end_date) : null;
  return { emailOptedOut: profile.is_email_opted_out, contactOffLimits: offLimits, contactOffLimitsUntil: date && Number.isFinite(date.getTime()) ? date : null, contactRestrictionReason: (offLimits ? profile.off_limit_reason || profile.status_label : null) || (profile.is_email_opted_out ? "Email opt-out imported from Recruit CRM" : null) };
}
