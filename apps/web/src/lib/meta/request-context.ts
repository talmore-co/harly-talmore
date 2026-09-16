import { isIP } from "node:net";

export type MetaRequestContext = {
  client_user_agent: string;
  client_ip_address?: string;
  fbp?: string;
  fbc?: string;
};

/** Read only the marketing consent and bounded attribution cookies from a hosted submission. */
export function metaRequestContext(
  headers: Headers,
  ip: string,
): MetaRequestContext | null {
  const cookies = new Map(
    (headers.get("cookie") ?? "").split(/;\s*/).map((entry) => {
      const index = entry.indexOf("=");
      return [entry.slice(0, index), entry.slice(index + 1)];
    }),
  );
  try {
    if (
      JSON.parse(
        decodeURIComponent(cookies.get("harly_cookie_consent") ?? "null"),
      )?.marketing !== true
    )
      return null;
  } catch {
    return null;
  }
  const agent = headers.get("user-agent")?.slice(0, 1024);
  if (!agent) return null;
  const result: MetaRequestContext = { client_user_agent: agent };
  if (isIP(ip)) result.client_ip_address = ip;
  for (const key of ["fbp", "fbc"] as const) {
    const value = cookies.get(`_${key}`);
    if (value && /^fb\.\d\.\d{10,16}\.[A-Za-z0-9._-]{1,500}$/.test(value))
      result[key] = value;
  }
  return result;
}
