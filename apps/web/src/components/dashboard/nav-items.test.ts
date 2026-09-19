import { describe, expect, it } from "vitest";
import { hasNavPermission, isNavActive, settingsNav, visibleNavigation } from "./nav-items";

describe("staff navigation permissions", () => {
  it("keeps Settings reachable for narrowly scoped configuration roles", () => {
    expect(hasNavPermission(settingsNav, ["templates:manage"])).toBe(true);
    expect(hasNavPermission(settingsNav, ["documents:manage"])).toBe(true);
    expect(hasNavPermission(settingsNav, ["dsar:manage"])).toBe(true);
    expect(hasNavPermission(settingsNav, ["candidates:view"])).toBe(false);
  });

  it("does not expose operational documents to configuration-only users", () => {
    const links = visibleNavigation(["documents:manage"]).flatMap((group) => group.items);
    expect(links.some((item) => item.href === "/dashboard/documents")).toBe(false);
    expect(links.some((item) => item.href === "/dashboard/clients")).toBe(false);
    expect(visibleNavigation(["documents:read"]).flatMap((group) => group.items).some((item) => item.href === "/dashboard/documents")).toBe(true);
  });

  it("keeps nested and relocated screens attached to their main destination", () => {
    const candidates = visibleNavigation(["candidates:view"]).flatMap((group) => group.items).find((item) => item.label === "Candidates")!;
    expect(isNavActive("/dashboard/talent-pool", candidates)).toBe(true);
    expect(isNavActive("/dashboard/candidates/example", candidates)).toBe(true);
    expect(isNavActive("/dashboard/candidates-other", candidates)).toBe(false);
    expect(isNavActive("/settings/templates", settingsNav)).toBe(true);
    expect(isNavActive("/dashboard/templates/new", settingsNav)).toBe(true);
    expect(isNavActive("/people", settingsNav)).toBe(true);
  });
});
