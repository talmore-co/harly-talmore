"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/notification-island/toast";
import {
  saveWorkspaceMetaSettings,
  testWorkspaceMetaConnection,
  type getMyWorkspaceMetaSettings,
} from "./meta-actions";

export function MetaPixelPanel({
  settings,
}: {
  settings: Awaited<ReturnType<typeof getMyWorkspaceMetaSettings>>;
}) {
  const router = useRouter();
  const [pixelId, setPixelId] = useState(settings.pixelId);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [accessToken, setToken] = useState("");
  const [testEventCode, setTestCode] = useState(settings.testEventCode);
  const [pending, startTransition] = useTransition();
  const save = (disconnect = false) =>
    startTransition(async () => {
      try {
        const result = await saveWorkspaceMetaSettings({
          pixelId: disconnect ? "" : pixelId,
          enabled: disconnect ? false : enabled,
          accessToken: disconnect ? "" : accessToken,
          testEventCode: disconnect ? "" : testEventCode,
          removeToken: disconnect,
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setToken("");
        if (disconnect) {
          setPixelId("");
          setEnabled(false);
          setTestCode("");
        }
        router.refresh();
        toast.success(
          disconnect
            ? "Meta disconnected. Pending deliveries cancelled."
            : "Meta settings saved.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not save Meta settings.",
        );
      }
    });
  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b pb-6">
        <h1 className="text-2xl font-semibold">Meta advertising</h1>
        <p className="text-sm text-muted-foreground">
          Meta Pixel and Conversions API for your hosted application funnel.
        </p>
        <p className="text-sm">
          {settings.pixelId ? "Pixel configured" : "Not connected"} ·{" "}
          {settings.enabled && settings.hasToken
            ? "Conversions API enabled"
            : "Conversions API disabled"}
        </p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="max-w-2xl space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor="meta-pixel">Pixel / Dataset ID</Label>
          <Input
            id="meta-pixel"
            inputMode="numeric"
            value={pixelId}
            onChange={(event) => setPixelId(event.target.value)}
            placeholder="Numeric ID from Meta Events Manager"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
            disabled={!settings.encryptionReady}
          />
          Enable server-side Conversions API
        </label>
        {!settings.encryptionReady && (
          <p className="text-sm text-destructive">
            Configure the server&apos;s AI_ENCRYPTION_KEY to store the access
            token securely.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="meta-token">Conversions API access token</Label>
          <Input
            id="meta-token"
            type="password"
            autoComplete="new-password"
            value={accessToken}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              settings.hasToken
                ? "Saved securely. Leave blank to keep it."
                : "Paste token from Events Manager"
            }
            disabled={!settings.encryptionReady}
          />
          <p className="text-xs text-muted-foreground">
            Generate a token in Events Manager → your dataset → Settings →
            Conversions API. Tokens are encrypted and never returned to the
            browser.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="meta-test-code">Test Events code, optional</Label>
          <Input
            id="meta-test-code"
            value={testEventCode}
            onChange={(event) => setTestCode(event.target.value)}
            placeholder="TEST12345"
          />
          <p className="text-xs text-muted-foreground">
            Copy this from Meta&apos;s Test Events tab. While saved, server
            events are test events. Clear it and save before running live
            campaigns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} type="submit">
            Save Meta settings
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !settings.hasToken || !settings.testEventCode}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await testWorkspaceMetaConnection();
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Connection test failed.",
                  );
                }
              })
            }
          >
            Send test event
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !settings.pixelId}
            onClick={() => save(true)}
          >
            Disconnect Meta
          </Button>
        </div>
      </form>
      <section className="max-w-3xl space-y-2 rounded-xl border p-5 text-sm">
        <h2 className="font-semibold">What gets sent</h2>
        <p>
          With marketing consent, the browser sends page views, application
          starts and conversions. The server sends SubmitApplication and
          QualifiedApplication only after an application is saved. Matching
          event IDs let Meta deduplicate the browser and server copies.
        </p>
        <p className="text-muted-foreground">
          Server matching uses the visitor&apos;s IP address, browser user agent
          and Meta attribution cookies when available. Names, emails,
          questionnaire answers and raw scores are not sent. Each job&apos;s
          questionnaire threshold controls qualification; everyone can still
          apply.
        </p>
        <p className="text-muted-foreground">
          Only Harly-hosted public forms enqueue server conversions. Portal and
          third-party embedded submissions are not tracked server-side.
          Transient failures retry automatically for up to 47 hours, with ten
          attempts maximum. The connection-test button sends a test event using
          your browser&apos;s IP address and user agent.
        </p>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent server deliveries</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.refresh()}
          >
            Refresh
          </Button>
        </div>
        {!settings.recent.length ? (
          <p className="text-sm text-muted-foreground">
            No server conversions yet. Consented applications will appear here.
            Delivery runs once a minute.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3">Event</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Attempts</th>
                  <th className="p-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {settings.recent.map((event) => (
                  <tr key={event.id} className="border-b last:border-0">
                    <td className="p-3">
                      {event.eventName}
                      {event.test ? " (test)" : ""}
                    </td>
                    <td className="p-3">{event.status}</td>
                    <td className="p-3">{event.attempts}</td>
                    <td className="p-3 text-muted-foreground">
                      {event.lastError ??
                        (event.deliveredAt
                          ? "Accepted by Meta"
                          : "Awaiting delivery")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
