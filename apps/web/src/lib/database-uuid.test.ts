import { describe, expect, it } from "vitest";
import { databaseUuidSchema } from "./database-uuid";

describe("stored PostgreSQL UUIDs", () => {
  it("accepts canonical IDs even with non-RFC version and variant bits", () => {
    expect(databaseUuidSchema.safeParse("22b23e6a-05a3-f776-7579-e9328789f52e").success).toBe(true);
    expect(databaseUuidSchema.safeParse("819f5e90-d56f-49fb-af33-941886deb9e4").success).toBe(true);
  });
  it("rejects malformed or arbitrary strings", () => {
    for (const id of ["", "not-an-id", "22b23e6a-05a3-f776-7579-e9328789f52z", "22b23e6a-05a3-f776-7579-e9328789f52e-extra"]) expect(databaseUuidSchema.safeParse(id).success).toBe(false);
  });
});
