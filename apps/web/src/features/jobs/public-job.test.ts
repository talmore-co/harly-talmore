import { describe, expect, it } from "vitest";
import { withoutEvaluationGuidance } from "./public-job";
import { buildJobMeta } from "@/features/career-page/job/jobMeta";

describe("internal evaluation guidance", () => {
  const job = {
    slug: "fictional-operator", title: "Test operator", department: "Operations",
    location: "Test city", employmentType: "full_time", workplaceType: "onsite",
    description: "Public requirements belong here.",
    experienceLevel: "INTERNAL experience guidance",
    education: "INTERNAL education guidance", evaluationMode: "strict",
  };

  it("removes guidance from public payloads without changing the stored source", () => {
    const result = withoutEvaluationGuidance(job);
    expect(result).not.toHaveProperty("experienceLevel");
    expect(result).not.toHaveProperty("education");
    expect(result).not.toHaveProperty("evaluationMode");
    expect(result.description).toBe(job.description);
    expect(job.experienceLevel).toBe("INTERNAL experience guidance");
    expect(job.education).toBe("INTERNAL education guidance");
  });

  it("does not show experience metadata even when an editor passes the full job", () => {
    expect(buildJobMeta(job).map(item => item.label)).not.toContain("Experience");
    expect(JSON.stringify(buildJobMeta(job))).not.toContain("INTERNAL");
  });
});
