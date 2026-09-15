import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@harly/storage", () => ({ createStorage: vi.fn((config) => config) }));

import { createStorage } from "@harly/storage";
import { createPublicAssetKey, getPublicAssetStorage, isPublicAssetKey, publicAssetKeyFromUrl, publicAssetUrl } from "./public-assets";

describe("public asset isolation", () => {
  beforeEach(() => {
    vi.stubEnv("HARLY_URL", "https://ats.example.com");
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("S3_BUCKET", "private-documents");
    vi.stubEnv("ASSETS_S3_BUCKET", "company-assets");
    vi.stubEnv("S3_ACCESS_KEY_ID", "document-key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "document-secret");
    vi.stubEnv("ASSETS_S3_ACCESS_KEY_ID", "asset-key");
    vi.stubEnv("ASSETS_S3_SECRET_ACCESS_KEY", "asset-secret");
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns same-origin URLs and round-trips only public asset keys", () => {
    const key = createPublicAssetKey("workspace-1");
    const url = publicAssetUrl(key);
    expect(url).toMatch(/^https:\/\/ats.example.com\/api\/public\/assets\/workspace-1\//);
    expect(publicAssetKeyFromUrl(url)).toBe(key);
    expect(publicAssetKeyFromUrl(url.replace("ats.example.com", "other.example.com"))).toBeNull();
  });

  it.each([
    "workspaces/workspace-1/resumes/id/cv.pdf",
    "workspaces/workspace-1/documents/id/file.png",
    "workspaces/workspace-1/images/public-applications/id/photo.png",
    "public-assets/workspace-1/../../resumes/cv.png",
    "public-assets/workspace-1/%2e%2e%2fresumes.png",
    "public-assets/workspace-1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.svg",
    "public-assets/workspace-1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png/extra",
  ])("rejects non-public or malformed keys: %s", (key) => {
    expect(isPublicAssetKey(key)).toBe(false);
    expect(() => publicAssetUrl(key)).toThrow();
  });

  it("uses the assets bucket and its credentials, not document storage", () => {
    getPublicAssetStorage();
    expect(createStorage).toHaveBeenCalledWith(expect.objectContaining({
      bucket: "company-assets", accessKeyId: "asset-key", secretAccessKey: "asset-secret",
    }));
  });

  it.each(["", "private-documents"])("refuses a missing or shared bucket: %s", (bucket) => {
    vi.stubEnv("ASSETS_S3_BUCKET", bucket);
    expect(() => getPublicAssetStorage()).toThrow("separate private bucket");
    expect(createStorage).not.toHaveBeenCalled();
  });
});
