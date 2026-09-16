import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), read: vi.fn(), put: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.permission }));
vi.mock("@harly/storage", () => ({ createStorage: () => ({ read: mocks.read, put: mocks.put }) }));

import { POST } from "./route";
import { GET } from "./[...key]/route";

const filename = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png";
function upload(content: string, type = "image/svg+xml", origin = "https://ats.example.com") {
  const body = new FormData();
  body.set("file", new File([content], "logo.svg", { type }));
  return new Request("https://ats.example.com/api/public/assets", { method: "POST", body, headers: { origin } });
}

describe("public asset routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("HARLY_URL", "https://ats.example.com");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    mocks.permission.mockResolvedValue({ organization: { id: "workspace-1" } });
    mocks.put.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires settings permission before reading or storing uploads", async () => {
    mocks.permission.mockRejectedValue(new Error("Forbidden"));
    expect((await POST(upload("anything"))).status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledWith("settings:edit");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects cross-origin uploads", async () => {
    expect((await POST(upload("anything", "image/png", "https://other.example.com"))).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rasterizes SVGs and returns a public Harly URL", async () => {
    const response = await POST(upload('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>'));
    expect(response.status).toBe(200);
    const [key, bytes, contentType] = mocks.put.mock.calls[0];
    expect(key).toMatch(/^public-assets\/workspace-1\/[\da-f-]+\.webp$/);
    expect(contentType).toBe("image/webp");
    expect((await sharp(bytes).metadata()).format).toBe("webp");
    expect((await response.json()).fileUrl).toBe(`https://ats.example.com/api/public/assets/${key.slice("public-assets/".length)}`);
  });

  it("rejects files with a forged image MIME type", async () => {
    expect((await POST(upload("%PDF-1.4 private document", "image/png"))).status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("limits streamed upload bodies", async () => {
    const request = new Request("https://ats.example.com/api/public/assets", {
      method: "POST", body: new Uint8Array(6 * 1024 * 1024),
    });
    expect((await POST(request)).status).toBe(413);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("serves a public asset without requiring a session", async () => {
    mocks.read.mockResolvedValue(Buffer.from("image bytes"));
    const response = await GET(new Request("https://ats.example.com"), { params: Promise.resolve({ key: ["workspace-1", filename] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.read).toHaveBeenCalledWith(`public-assets/workspace-1/${filename}`);
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it.each([
    ["workspaces", "workspace-1", "resumes", "cv.pdf"],
    ["workspaces", "workspace-1", "documents", "image.png"],
    ["workspace-1", "..", "resumes", filename],
    ["workspace-1", "%2e%2e%2f" + filename],
    ["workspace-1", filename.replace(".png", ".svg")],
  ])("rejects non-asset paths before accessing storage: %j", async (...parts) => {
    const response = await GET(new Request("https://ats.example.com"), { params: Promise.resolve({ key: parts }) });
    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns 404 for missing objects", async () => {
    mocks.read.mockRejectedValue(new Error("NoSuchKey"));
    expect((await GET(new Request("https://ats.example.com"), { params: Promise.resolve({ key: ["workspace-1", filename] }) })).status).toBe(404);
  });

  it("resizes existing PNG assets to persistent transparent WebP variants", async () => {
    const original = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 50, g: 100, b: 150, alpha: 0.5 } } }).png().toBuffer();
    mocks.read.mockRejectedValueOnce(new Error("NoSuchKey")).mockResolvedValueOnce(original);
    const response = await GET(new Request("https://ats.example.com?w=320&v=1"), { params: Promise.resolve({ key: ["workspace-1", filename] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("content-type")).toBe("image/webp");
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ width: 320, height: 160, format: "webp", hasAlpha: true });
    expect(mocks.put.mock.calls[0][0]).toBe(`public-asset-variants/v1/workspace-1/${filename.replace(".png", "-320.webp")}`);
  });

  it("reuses a stored variant without reading the original", async () => {
    mocks.read.mockResolvedValue(Buffer.from("cached variant"));
    const response = await GET(new Request("https://ats.example.com?w=768"), { params: Promise.resolve({ key: ["workspace-1", filename] }) });
    expect(await response.text()).toBe("cached variant");
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it.each(["0", "999", "-320", "320.0", "NaN"])("rejects unsupported sizes before storage: %s", async width => {
    const response = await GET(new Request(`https://ats.example.com?w=${width}`), { params: Promise.resolve({ key: ["workspace-1", filename] }) });
    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
