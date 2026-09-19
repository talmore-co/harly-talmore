"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/notification-island/toast";
import { archiveClient, saveClient } from "./actions";

type Contact = { name: string; email: string; phone: string; role: string };
export function ClientEditor({ client, canManage }: { client?: { id: string; name: string; website: string | null; notes: string | null; contacts: Contact[]; archived: boolean }; canManage: boolean }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(client?.contacts ?? []);
  const [pending, startTransition] = useTransition();
  return <form className="max-w-3xl space-y-5" onSubmit={(event) => {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveClient({ id: client?.id, name: String(fields.get("name")), website: String(fields.get("website")), notes: String(fields.get("notes")), contacts });
      if (!result.success) return void toast.error(result.error);
      toast.success("Client saved"); router.push(`/dashboard/clients/${result.id}`); router.refresh();
    });
  }}>
    <fieldset disabled={!canManage || pending} className="space-y-5">
      <label className="block space-y-2 text-sm">Company name<Input name="name" required maxLength={200} defaultValue={client?.name} /></label>
      <label className="block space-y-2 text-sm">Website<Input name="website" type="url" placeholder="https://example.com" defaultValue={client?.website ?? ""} /></label>
      <div className="space-y-3"><h2 className="font-medium">Contacts</h2>{contacts.map((contact, index) => <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        {(["name", "role", "email", "phone"] as const).map((key) => <label key={key} className="space-y-1 text-sm capitalize">{key}<Input aria-label={`Contact ${index + 1} ${key}`} required={key === "name"} type={key === "email" ? "email" : "text"} value={contact[key]} onChange={(event) => setContacts((items) => items.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} /></label>)}
        <Button type="button" variant="ghost" onClick={() => setContacts((items) => items.filter((_, i) => i !== index))}>Remove contact</Button>
      </div>)}{canManage ? <Button type="button" variant="outline" onClick={() => setContacts((items) => [...items, { name: "", role: "", email: "", phone: "" }])}>Add contact</Button> : null}</div>
      <label className="block space-y-2 text-sm">Internal notes<Textarea name="notes" maxLength={10000} rows={5} defaultValue={client?.notes ?? ""} /></label>
      {canManage ? <Button type="submit">{pending ? "Saving…" : "Save client"}</Button> : null}
    </fieldset>
    {client && canManage ? <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      const result = await archiveClient(client.id, !client.archived);
      if (!result.success) return void toast.error(result.error);
      toast.success(client.archived ? "Client restored" : "Client archived"); router.refresh();
    })}>{client.archived ? "Restore client" : "Archive client"}</Button> : null}
  </form>;
}
