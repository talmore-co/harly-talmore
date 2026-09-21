"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeMyMcpConnection } from "./mcp-actions";

export function McpConnectionsCard({
  connections,
  endpoint,
}: {
  connections: { id: string; name: string | null; scopes: string[] }[];
  endpoint: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-4 rounded-xl border p-6">
      <h2 className="font-semibold">AI assistants</h2>
      <p className="text-sm text-muted-foreground">
        Add this MCP URL in Claude or ChatGPT, then sign in to Talmore and
        authorize access.
      </p>
      <code className="block break-all text-sm">{endpoint}</code>
      {connections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No assistants connected.
        </p>
      )}
      {connections.map((connection) => (
        <div
          key={connection.id}
          className="flex items-center justify-between gap-4 border-t pt-4"
        >
          <div>
            <p className="text-sm font-medium">
              {connection.name || "AI assistant"}
            </p>
            <p className="text-xs text-muted-foreground">
              {connection.scopes.includes("harly:write")
                ? "Read and write access"
                : "Read access"}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await revokeMyMcpConnection(connection.id);
                } catch {
                  setError("Could not revoke access. Try again.");
                }
              })
            }
          >
            Revoke access
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
