import { describe, expect, it } from "vitest";
import { taskContextHref } from "./task-link";

describe("task context navigation", () => {
  it("opens the Tasks tab for the exact application", () => {
    const url = new URL(
      taskContextHref({
        candidateId: "candidate",
        applicationId: "second-application",
      }),
      "https://example.test",
    );
    expect(url.pathname).toBe("/dashboard/candidates/candidate");
    expect(url.searchParams.get("applicationId")).toBe("second-application");
    expect(url.searchParams.get("tab")).toBe("profile");
    expect(url.hash).toBe("#application-tasks");
  });
  it("preserves destinations for tasks without application context", () => {
    expect(
      taskContextHref({ candidateId: "candidate", applicationId: null }),
    ).toBe("/dashboard/candidates/candidate");
    expect(taskContextHref({ candidateId: null, applicationId: null })).toBe(
      "/dashboard/tasks",
    );
  });
});
