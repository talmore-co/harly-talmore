"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

const descriptions: Record<string, string> = {
  "harly:read":
    "Read candidates, applications, jobs, pipelines and interview notes.",
  "harly:write":
    "Create candidates and draft jobs, configure questionnaires, add candidates to pipelines, save notes and move application stages.",
  offline_access:
    "Stay connected until you revoke access or the connection expires.",
};
export function McpConsentForm({
  query,
  scopes,
}: {
  query: string;
  scopes: string[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function respond(accept: boolean) {
    start(async () => {
      setError(null);
      try {
        const response = await fetch("/api/auth/oauth2/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accept,
            oauth_query: query,
            scope: scopes.join(" "),
          }),
        });
        const data = await response.json();
        if (!response.ok || typeof data.url !== "string") throw new Error();
        window.location.assign(data.url);
      } catch {
        setError(
          "Could not authorize this connection. Start again from your assistant.",
        );
      }
    });
  }
  return (
    <div className="space-y-5">
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {scopes.filter(Boolean).map((scope) => (
          <li key={scope}>{descriptions[scope] ?? scope}</li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => respond(false)}
        >
          Cancel
        </Button>
        <Button disabled={pending} onClick={() => respond(true)}>
          Allow access
        </Button>
      </div>
    </div>
  );
}
