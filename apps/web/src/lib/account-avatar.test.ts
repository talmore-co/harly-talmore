import { describe, expect, it } from "vitest";
import { accountAvatarKey, accountAvatarUrl } from "./account-avatar";

const key =
  "workspaces/workspace-1/images/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg";
describe("account avatar URLs", () => {
  it.each([
    `/uploads/${key}`,
    `https://storage.example.test/private-bucket/${key}`,
    key,
  ])("recovers existing uploaded image keys", (value) => {
    expect(accountAvatarKey(value)).toBe(key);
    expect(accountAvatarUrl(value)).toBe(
      `/api/account/avatar?key=${encodeURIComponent(key)}`,
    );
  });
  it("keeps proxy URLs stable and external avatars unchanged", () => {
    const proxy = accountAvatarUrl(key)!;
    expect(accountAvatarUrl(proxy)).toBe(proxy);
    expect(accountAvatarUrl("https://photo.example.test/photo.jpg")).toBe(
      "https://photo.example.test/photo.jpg",
    );
  });
  it.each([
    key.replace("images", "resumes"),
    key.replace("images", "documents"),
    key.replace("avatar.jpg", "..%2Fsecret"),
    "file:///etc/passwd",
    "/api/account/avatar?key=../secret",
  ])("rejects non-image or malformed keys", (value) => {
    expect(accountAvatarKey(value)).toBeNull();
  });
});
