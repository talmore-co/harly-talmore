import { auth } from "@/lib/auth";
import { oauthProviderAuthServerMetadata } from "@harly/auth/mcp-oauth";

export const GET = oauthProviderAuthServerMetadata(auth);
