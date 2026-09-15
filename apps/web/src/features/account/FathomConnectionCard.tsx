"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/notification-island/toast";
import {
  connectMyFathomAccount,
  disconnectMyFathomConnection,
  getMyFathomConnection,
  resetIncompleteFathomSetup,
} from "./fathom-actions";

export function FathomConnectionCard({
  status,
}: {
  status: Awaited<ReturnType<typeof getMyFathomConnection>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    message: string,
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setApiKey("");
          toast.success(message);
        } else toast.error(result.error ?? "Could not update Fathom.");
        router.refresh();
      } catch {
        toast.error(
          "Could not update the Fathom connection. Please try again.",
        );
        router.refresh();
      }
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fathom</CardTitle>
        <CardDescription>
          Connect your personal account to attach recordings, summaries and
          transcripts to your scheduled interviews. Other meetings are ignored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status.configured ? (
          <p className="text-sm text-muted-foreground">
            Server encryption must be configured to connect Fathom.
          </p>
        ) : status.enabled ? (
          <>
            <p className="text-sm">
              {status.recorderEmail
                ? `Connected · ${status.recorderEmail}`
                : "Connected to Fathom"}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.lastImportedAt
                ? `Last matched recording: ${new Date(status.lastImportedAt).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`
                : "Waiting for the first matching interview recording."}
            </p>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(disconnectMyFathomConnection, "Fathom disconnected")
              }
            >
              Disconnect
            </Button>
          </>
        ) : status.setupPending ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Setup was interrupted. In Fathom API Access settings, remove any
              webhook using this destination, then reset setup.
            </p>
            <Input
              aria-label="Incomplete Fathom webhook destination"
              readOnly
              value={status.callbackUrl ?? ""}
              onFocus={(event) => event.currentTarget.select()}
            />
            <a
              className="text-sm underline"
              href="https://fathom.video/customize#api-access-header"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Fathom settings
            </a>
            <div>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => resetIncompleteFathomSetup({ removedWebhook: true }),
                    "Fathom setup reset",
                  )
                }
              >
                I&apos;ve removed the webhook · Reset setup
              </Button>
            </div>
          </div>
        ) : status.cleanupPending ? (
          <>
            <p className="text-sm text-muted-foreground">
              Imports are stopped. Retry disconnect to remove the webhook from
              Fathom.
            </p>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(disconnectMyFathomConnection, "Fathom disconnected")
              }
            >
              Retry disconnect
            </Button>
            <details className="space-y-3 text-sm">
              <summary className="cursor-pointer">
                API key no longer works?
              </summary>
              <p className="text-muted-foreground">
                Remove the webhook for this destination in Fathom settings, then
                clear the connection here.
              </p>
              <Input
                aria-label="Fathom webhook to remove"
                readOnly
                value={status.callbackUrl ?? ""}
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => resetIncompleteFathomSetup({ removedWebhook: true }),
                    "Fathom connection cleared",
                  )
                }
              >
                I&apos;ve removed the webhook · Clear connection
              </Button>
            </details>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="fathom-api-key">Personal Fathom API key</Label>
              <Input
                id="fathom-api-key"
                type="password"
                autoComplete="new-password"
                placeholder="Paste your API key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={pending || !apiKey.trim()}
                onClick={() =>
                  run(
                    () => connectMyFathomAccount({ apiKey }),
                    "Fathom connected",
                  )
                }
              >
                {pending ? "Connecting…" : "Connect Fathom"}
              </Button>
              <a
                className="text-sm underline"
                href="https://fathom.video/customize#api-access-header"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get an API key
              </a>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
