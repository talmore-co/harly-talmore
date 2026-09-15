/** Accept only Harly's workspace image namespace, never document keys. */
export function accountAvatarKey(value: string): string | null {
  try {
    const url = new URL(value, "http://harly.internal");
    const key =
      url.pathname === "/api/account/avatar"
        ? url.searchParams.get("key")
        : decodeURIComponent(url.pathname)
            .match(/(?:^|\/)workspaces\/.*$/)?.[0]
            .replace(/^\//, "");
    return key &&
      key.length <= 512 &&
      !key.includes("..") &&
      /^workspaces\/[A-Za-z0-9_-]{1,128}\/images\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(
        key,
      )
      ? key
      : null;
  } catch {
    return null;
  }
}

export function accountAvatarUrl(value: string | null | undefined) {
  if (!value) return value;
  const key = accountAvatarKey(value);
  return key ? `/api/account/avatar?key=${encodeURIComponent(key)}` : value;
}
