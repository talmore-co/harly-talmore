"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkRecruitCrm, disconnectRecruitCrm, getRecruitCrmConnections, saveRecruitCrmConnection } from "./actions";

export function RecruitCrmConnectionPanel({ connections }: { connections: Awaited<ReturnType<typeof getRecruitCrmConnections>> }) {
  const [id, setId] = useState<string>(); const [name, setName] = useState(""); const [token, setToken] = useState(""); const [message, setMessage] = useState("");
  const [pending, start] = useTransition(); const router = useRouter();
  const run = (action: () => Promise<void>) => start(async () => { try { await action(); } catch { setMessage("Could not update the connection. Please try again."); } });
  return <section className="max-w-xl space-y-5">
    <div><h1 className="text-2xl font-semibold">Recruit CRM</h1><p className="mt-2 text-sm text-muted-foreground">Import selected candidates into a job or your Talent pool. Tokens are encrypted, and the connector only reads from Recruit CRM.</p></div>
    {connections.map(connection => <div key={connection.id} className="space-y-3 rounded-lg border p-4"><h2 className="font-medium">{connection.name}</h2><p className="text-sm text-muted-foreground">{connection.connected ? "Connected" : "Disconnected"}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => { setId(connection.id); setName(connection.name); setToken(""); }}>Replace token</Button>{connection.connected && <><Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await checkRecruitCrm(connection.id); setMessage(result.ok ? "Connection verified." : result.error); router.refresh(); })}>Check connection</Button><Button variant="outline" disabled={pending} onClick={() => run(async () => { await disconnectRecruitCrm(connection.id); setMessage("Disconnected. Imported candidates are retained."); router.refresh(); })}>Disconnect</Button></>}</div></div>)}
    <div className="space-y-2"><Label htmlFor="crm-name">Connection name</Label><Input id="crm-name" value={name} onChange={event => setName(event.target.value)} placeholder="Previous recruiting database" /></div>
    <div className="space-y-2"><Label htmlFor="crm-token">API token</Label><Input id="crm-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} /><p className="text-xs text-muted-foreground">An administrator can copy the token from Recruit CRM → Admin Settings → API & Integrations.</p></div>
    <div className="flex gap-2"><Button disabled={pending || !name.trim() || !token.trim()} onClick={() => run(async () => { const result = await saveRecruitCrmConnection({ id, name, token }); setMessage(result.ok ? "Connection saved." : result.error); if (result.ok) { setToken(""); setName(""); setId(undefined); router.refresh(); } })}>{pending ? "Checking…" : id ? "Save token" : "Add connection"}</Button>{id && <Button variant="outline" onClick={() => { setId(undefined); setToken(""); setName(""); }}>Cancel</Button>}</div>
    <p role="status" className="text-sm">{message}</p>
    {connections.some(connection => connection.connected) && <Button asChild variant="outline"><Link href="/dashboard/candidates?import=recruitcrm">Import candidates</Link></Button>}
  </section>;
}
