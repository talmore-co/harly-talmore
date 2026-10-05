import { describe, expect, it } from "vitest";

import {
  candidateProfileHref,
  directoryFiltersFromQuery,
  directoryHref,
  directoryQueryWithFilter,
  sanitizeDirectoryQuery,
} from "./directory-params";

describe("directoryQueryWithFilter", () => {
  it("keeps the requested page when paginating", () => {
    expect(directoryQueryWithFilter("?stage=Interview", "page", "2")).toBe(
      "stage=Interview&page=2",
    );
    expect(directoryQueryWithFilter("stage=Interview&page=2", "page", "3")).toBe(
      "stage=Interview&page=3",
    );
  });

  it("drops the page param when returning to the first page", () => {
    expect(directoryQueryWithFilter("q=ada&page=2", "page", "1")).toBe("q=ada");
  });

  it("returns to the first page when a filter changes", () => {
    expect(directoryQueryWithFilter("q=ada&page=3", "stage", "Offer")).toBe(
      "q=ada&stage=Offer",
    );
    expect(directoryQueryWithFilter("q=ada&page=3", "q", "grace")).toBe(
      "q=grace",
    );
  });

  it("removes neutral filter values", () => {
    expect(directoryQueryWithFilter("stage=Offer&q=ada", "stage", "__all__")).toBe(
      "q=ada",
    );
    expect(directoryQueryWithFilter("sort=name", "sort", "recent")).toBe("");
    expect(directoryQueryWithFilter("q=ada", "q", "")).toBe("");
  });
});

describe("directory list context on profile links", () => {
  it("round-trips the list query through a profile link", () => {
    const href = candidateProfileHref("candidate-1", "q=a%26b&stage=Offer&page=2");
    expect(href).toBe(
      "/dashboard/candidates/candidate-1?list=q%3Da%2526b%26stage%3DOffer%26page%3D2",
    );
    const list = new URL(href, "https://harly.test").searchParams.get("list");
    expect(sanitizeDirectoryQuery(list)).toBe("q=a%26b&stage=Offer&page=2");
  });

  it("links to the bare profile and directory without list context", () => {
    expect(candidateProfileHref("candidate-1", "")).toBe(
      "/dashboard/candidates/candidate-1",
    );
    expect(directoryHref("")).toBe("/dashboard/candidates");
    expect(directoryHref("q=ada")).toBe("/dashboard/candidates?q=ada");
  });

  it("drops params the directory does not understand", () => {
    expect(
      sanitizeDirectoryQuery("q=ada&view=trash&applicationId=x&import=csv"),
    ).toBe("q=ada");
    expect(sanitizeDirectoryQuery(undefined)).toBe("");
  });

  it("maps a list query to directory filters", () => {
    expect(
      directoryFiltersFromQuery("q=ada&dept=Eng&status=hired&sort=name&page=4"),
    ).toEqual({
      query: "ada",
      department: "Eng",
      role: undefined,
      stage: undefined,
      status: "hired",
      source: undefined,
      tag: undefined,
      sort: "name",
    });
    expect(directoryFiltersFromQuery("status=bogus&sort=bogus")).toMatchObject({
      status: undefined,
      sort: "recent",
    });
  });
});
