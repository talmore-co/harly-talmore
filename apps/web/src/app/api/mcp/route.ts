import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/server/mcp/auth";
import { createMcpServer } from "@/server/mcp/server";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = getHarlyPublicOrigin();
  if (request.headers.has("origin") && request.headers.get("origin") !== origin)
    return new Response(null, { status: 403 });
  try {
    const actor = await authenticateMcp(request);
    if (!actor)
      return new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
          "Cache-Control": "no-store",
        },
      });
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 256 * 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bytes,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer(actor);
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(boundedRequest);
      // JSON transport completes dispatch before resolving handleRequest.
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await server.close();
    }
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function GET(request: Request) {
  try {
    if (!(await authenticateMcp(request)))
      return new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${getHarlyPublicOrigin()}/.well-known/oauth-protected-resource/api/mcp"`,
          "Cache-Control": "no-store",
        },
      });
  } catch {
    return new Response(null, { status: 503 });
  }
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
export const DELETE = GET;
