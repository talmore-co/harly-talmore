import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { MCP_SCOPES } from "@harly/auth/mcp-oauth";

export async function GET() {
  const origin = getHarlyPublicOrigin();
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [`${origin}/api/auth`],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Talmore ATS",
  });
}
