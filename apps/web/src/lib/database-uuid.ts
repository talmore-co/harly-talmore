import { z } from "zod";

// PostgreSQL UUID columns also accept imported/deterministic IDs whose version
// and variant bits are not RFC UUIDs. Validate the stored canonical format.
export const databaseUuidSchema = z.string().regex(
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
  "Invalid record ID",
);
