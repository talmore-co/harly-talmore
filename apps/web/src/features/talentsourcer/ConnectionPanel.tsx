"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TalentSourcerLogo } from "@/components/ui/icons/brands";
import { checkTalentSourcer, connectTalentSourcer, disconnectTalentSourcer } from "./actions";
import type { connectionStatus } from "./connection";

export function TalentSourcerConnectionPanel({ status }: { status: Awaited<ReturnType<typeof connectionStatus>> }) {
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(action: () => Promise<void>) { startTransition(async () => { try { await action(); } catch { setMessage("The connection could not be updated. Please try again."); } }); }
  return <section className="max-w-xl space-y-5">
    <div><h1 className="flex items-center gap-3 text-2xl font-semibold"><TalentSourcerLogo className="size-9" />TalentSourcer AI</h1><p className="mt-2 text-sm text-muted-foreground">Connect multiple TalentSourcer workspaces and choose which one to import from. Connections are shared with authorized recruiters in your Talmore workspace.</p></div>
    {status.connections.map(connection => <div key={connection.organizationId} className="space-y-3 rounded-lg border p-4">
      <div><h2 className="font-medium">{connection.organizationName}</h2><p className="break-all text-xs text-muted-foreground">{connection.organizationId}</p><p className="mt-1 text-sm">{connection.connected ? "Connected" : "Disconnected"}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => { setReplacing(connection.organizationId); setToken(""); setMessage(""); }}>Replace token</Button>
        {connection.connected && <><Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await checkTalentSourcer(connection.organizationId); setMessage(result.ok ? `${connection.organizationName}: connection verified.` : result.error || "Connection failed."); router.refresh(); })}>Check connection</Button><Button variant="outline" disabled={pending} onClick={() => run(async () => { await disconnectTalentSourcer(connection.organizationId); setMessage(`${connection.organizationName} disconnected. Imported candidates are retained.`); router.refresh(); })}>Disconnect</Button></>}
      </div>
    </div>)}
    <div className="space-y-2"><Label htmlFor="talentsourcer-token">{replacing ? `Replace token for ${status.connections.find(row => row.organizationId === replacing)?.organizationName}` : "Add workspace with a personal access token"}</Label><Input id="talentsourcer-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste an organization-bound TalentSourcer token" /><p className="text-xs text-muted-foreground">Recommended scopes: projects:read, candidates:read and campaigns:read. Each workspace has its own encrypted token. Adding a token for an already connected workspace updates that connection.</p></div>
    <div className="flex flex-wrap gap-2"><Button disabled={pending || !token.trim()} onClick={() => run(async () => { const result = await connectTalentSourcer(token, replacing); setMessage(result.ok ? "Connection saved." : result.error || "Connection failed."); if (result.ok) { setToken(""); setReplacing(undefined); router.refresh(); } })}>{pending ? "Working…" : replacing ? "Save token" : "Add workspace"}</Button>
      {replacing && <Button variant="outline" disabled={pending} onClick={() => { setReplacing(undefined); setToken(""); }}>Cancel replacement</Button>}
    </div><p role="status" className="text-sm">{message}</p>
  </section>;
}
