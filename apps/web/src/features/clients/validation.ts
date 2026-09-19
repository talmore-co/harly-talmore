import { z } from "zod";
// PostgreSQL also accepts imported/deterministic UUIDs without RFC version bits.
export const agencyApplicationId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const agencyDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1900 && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date.");
export const hireDetailsSchema = z.object({ hiredOn: agencyDate, hireTerms: z.string().trim().max(10000) });
