import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sonnerSuccess: vi.fn(),
  pushIsland: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: mocks.sonnerSuccess }),
}));
vi.mock("./store", () => ({
  dismissIsland: vi.fn(),
  pushIsland: mocks.pushIsland,
  settleIsland: vi.fn(),
}));

import { toast } from "./toast";

describe("toast routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a short plain message in the topbar island", () => {
    toast.success("Thread archived.");
    expect(mocks.pushIsland).toHaveBeenCalledWith(
      "success",
      "Thread archived.",
      expect.any(Number),
    );
    expect(mocks.sonnerSuccess).not.toHaveBeenCalled();
  });

  it("keeps a toast with an action button as a corner toast", () => {
    const options = { action: { label: "Undo", onClick: () => {} } };
    toast.success("Thread archived.", options);
    expect(mocks.sonnerSuccess).toHaveBeenCalledWith("Thread archived.", options);
    expect(mocks.pushIsland).not.toHaveBeenCalled();
  });
});
