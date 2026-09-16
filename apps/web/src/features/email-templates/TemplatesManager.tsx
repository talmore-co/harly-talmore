"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { toast } from "@/lib/notification-island/toast";
import DOMPurify from "dompurify";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  setActiveEmailTemplate,
  updateEmailTemplate,
} from "@/features/email-templates/actions";
import {
  SYSTEM_TEMPLATE_TYPES,
  type EmailTemplateItem,
  type TemplateType,
} from "@/features/email-templates/shared";
import {
  findUnknownVariables,
  interpolateTemplate,
  TEMPLATE_VARIABLES,
} from "@/features/email-templates/interpolate";
import {
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/ui/icons/phosphor";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TEMPLATE_STARTERS } from "./starters";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  general: "General",
  interview_invite: "Interview",
  rejection: "Rejection",
  offer: "Offer",
  screening: "Screening",
  stage_change: "Stage change",
};

const TEMPLATE_TYPE_COLORS: Record<TemplateType, string> = {
  general: "bg-muted text-muted-foreground",
  interview_invite: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  rejection: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  offer: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  screening: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  stage_change: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

/** Types with a matching system auto-email , these can be "activated" to override the default. */
const ACTIVATABLE_TYPES = new Set<TemplateType>(SYSTEM_TEMPLATE_TYPES);
const MANUAL_TEMPLATE_TYPES: TemplateType[] = ["general", "screening", "stage_change"];

function isAutomaticTemplateType(type: TemplateType) {
  return ACTIVATABLE_TYPES.has(type);
}

function templateTypeDescription(type: TemplateType) {
  return isAutomaticTemplateType(type)
    ? "Use for this email type: activation chooses the wording, not when an email sends. Rejection emails require an explicit choice."
    : "Manual only: use it when composing an email to a candidate.";
}

// Groups for the variable pill picker
const VARIABLE_GROUPS = Array.from(
  TEMPLATE_VARIABLES.reduce((map, v) => {
    if (!map.has(v.group)) map.set(v.group, []);
    map.get(v.group)!.push(v);
    return map;
  }, new Map<string, typeof TEMPLATE_VARIABLES[number][]>()),
);

const PREVIEW_VALUES = {
  candidate_first_name: "Ava",
  candidate_last_name: "Thompson",
  candidate_full_name: "Ava Thompson",
  job_title: "Senior Frontend Engineer",
  stage_name: "Technical Interview",
  interview_date: "Tuesday, July 8",
  interview_time: "10:00 AM PST",
  interview_location: "https://meet.google.com/abc-xyz",
  offer_salary: "$140,000 / yr",
  offer_expiry: "July 12, 2026",
  offer_url: "https://jobs.acme.com/portal/applications/offer-123",
  company_name: "Acme Inc.",
  portal_link: "https://jobs.acme.com/portal",
  sender_name: "You",
};

const EMPTY_DRAFT = {
  name: "",
  type: "general" as TemplateType,
  subject: "",
  body: "",
};

type TemplateDraft = typeof EMPTY_DRAFT;

// ─── TemplatesManager ─────────────────────────────────────────────────────────

export function TemplatesManager({
  templates,
  workspaceName,
}: {
  templates: EmailTemplateItem[];
  workspaceName: string;
}) {
  const previewValues = { ...PREVIEW_VALUES, company_name: workspaceName };
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateItem | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<TemplateType | "all">("all");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editorKey] = useState(0);

  const [name, setName] = useState(EMPTY_DRAFT.name);
  const [type, setType] = useState<TemplateType>(EMPTY_DRAFT.type);
  const [subject, setSubject] = useState(EMPTY_DRAFT.subject);
  const [body, setBody] = useState(EMPTY_DRAFT.body);
  const [initialDraft] = useState<TemplateDraft>(EMPTY_DRAFT);

  // Ref handle exposed by RichTextEditor , lets us insert at cursor
  const editorRef = useRef<{ insertText: (text: string) => void } | null>(null);

  const isDirty =
    name.trim() !== initialDraft.name ||
    type !== initialDraft.type ||
    subject.trim() !== initialDraft.subject ||
    body !== initialDraft.body;

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const unknownVariables = findUnknownVariables(`${subject}\n${body}`);

  function openNew(starterType?: TemplateType) {
    router.push((starterType ? `/dashboard/templates/new?starter=${starterType}` : "/dashboard/templates/new") as Route);
    setChooserOpen(false);
  }

  function openEdit(template: EmailTemplateItem) {
    router.push(`/dashboard/templates/${template.id}` as Route);
  }

  function closeEditor() {
    setOpen(false);
    setEditing(null);
  }

  function save() {
    startTransition(async () => {
      const fields = { name, type, subject, body };
      const result = editing
        ? await updateEmailTemplate({ templateId: editing.id, ...fields })
        : await createEmailTemplate(fields);

      if (!result.success) {
        toast.error(result.error ?? "Could not save the template.");
        return;
      }
      toast.success(editing ? "Template updated" : "Template created");
      closeEditor();
      router.refresh();
    });
  }

  function remove(template: EmailTemplateItem) {
    if (!window.confirm(`Delete the "${template.name}" template?`)) return;
    startTransition(async () => {
      const result = await deleteEmailTemplate({ templateId: template.id });
      if (!result.success) {
        toast.error(result.error ?? "Could not delete the template.");
        return;
      }
      toast.success("Template deleted");
      router.refresh();
    });
  }

  function toggleActive(template: EmailTemplateItem, active: boolean) {
    startTransition(async () => {
      const result = await setActiveEmailTemplate({
        templateId: template.id,
        active,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not update the template.");
        return;
      }
      toast.success(
        !active
          ? "Reverted to the default email"
          : `Now used for every ${TEMPLATE_TYPE_LABELS[template.type].toLowerCase()} email`,
      );
      router.refresh();
    });
  }

  // Strip HTML tags for plain-text preview of body in cards
  function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return (
    <div className="space-y-4">
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create template</DialogTitle>
            <DialogDescription>Choose suggested wording to edit, or start with a blank template. Nothing is saved until you save in the editor.</DialogDescription>
          </DialogHeader>
          <div className="divide-y">
            {TEMPLATE_STARTERS.map(starter => (
              <div key={starter.type} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{starter.name}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{starter.description}</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => openNew(starter.type)} aria-label={`Use ${starter.name.toLowerCase()} template`}>Use template</Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-1"><p className="text-sm font-medium">Blank template</p><p className="text-xs text-muted-foreground">Write your own subject and message.</p></div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => openNew()}>Start blank</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>How emails work</DialogTitle><DialogDescription>Templates choose the wording. Recruiting actions determine when messages send.</DialogDescription></DialogHeader>
          <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Moving pipeline stages never sends an email, including moving someone into Rejected or Offer.</li>
            <li>The Reject action sends an email only when you select Send rejection email. This is off by default.</li>
            <li>Scheduling sends an invitation when Send invitation email is selected. Rescheduling and cancellation actions send updates. Calendar providers may also send notifications.</li>
            <li>Sending an offer sends the offer email. Manual outreach sends when you click Send in the email composer.</li>
            <li>Use this template selects the wording for interview invitations, rejections or offers across the workspace. Only one template per type can be active. Turning it off restores the built-in message.</li>
            <li>General, screening and stage-update templates are for manual outreach. Application confirmations, rescheduling and cancellation emails use built-in wording.</li>
          </ul>
        </DialogContent>
      </Dialog>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <p className="text-sm text-muted-foreground">Customize email wording and save reusable messages. Templates do not control when emails are sent.</p>
          <button type="button" onClick={() => setHelpOpen(true)} className="text-xs font-medium underline underline-offset-4 hover:text-primary">How emails work</button>
        </div>
        {templates.length > 0 ? (
          <Button size="sm" onClick={() => setChooserOpen(true)}>
            <PlusIcon className="size-4" />
            Create template
          </Button>
        ) : null}
      </div>

      {/* Search + type filter */}
      {templates.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as TemplateType | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map((t) => (
                <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state */}
      {templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <FileTextIcon className="size-5" />
            </span>
            <h2 className="text-base font-semibold">No custom email templates yet</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Your team can already send emails using the built-in messages. Create a template to customize the wording or save a message for manual outreach.
            </p>
            <Button className="mt-2" onClick={() => setChooserOpen(true)}><PlusIcon className="size-4" />Create template</Button>
            <p className="text-xs text-muted-foreground">Creating a template does not send an email.</p>
          </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          variant="filtered"
          icon={FileTextIcon}
          title="No templates match these filters"
          hint="Try another stage or category, or search by the template's name."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className={cn("gap-0 overflow-hidden py-0", template.isActive && isAutomaticTemplateType(template.type) && "border-primary/40")}>
              <CardContent className="flex-1 space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h2 className="break-words font-semibold">{template.name}</h2>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("w-fit rounded-md px-2 py-0.5 text-[11px] font-semibold", TEMPLATE_TYPE_COLORS[template.type])}>
                        {TEMPLATE_TYPE_LABELS[template.type]}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {isAutomaticTemplateType(template.type) ? "Event message" : "Manual only"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => openEdit(template)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${template.name}`}
                      disabled={isPending}
                      onClick={() => remove(template)}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Subject</p>
                  <p className="break-words text-sm font-medium">{template.subject}</p>
                  <p className="line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">{stripHtml(template.body)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated <RelativeTime value={template.updatedAt} />
                </p>
              </CardContent>
              <div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-5 py-4">
                {isAutomaticTemplateType(template.type) ? (
                  <>
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor={`template-active-${template.id}`} className="cursor-pointer text-sm font-medium">Use this template</Label>
                      <p id={`template-active-hint-${template.id}`} className="text-xs leading-relaxed text-muted-foreground">
                        {template.isActive
                          ? "Used for this message type across the workspace. Turning off restores the built-in wording."
                          : "Turn on to use this wording for this message type. Replaces any other active template."}
                        {" "}Does not enable email sending.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className={cn("text-xs font-medium", template.isActive ? "text-foreground" : "text-muted-foreground")} aria-hidden="true">{template.isActive ? "On" : "Off"}</span>
                      <Switch
                        id={`template-active-${template.id}`}
                        checked={template.isActive}
                        onCheckedChange={active => toggleActive(template, active)}
                        disabled={isPending}
                        aria-label={`Use ${template.name} for ${TEMPLATE_TYPE_LABELS[template.type].toLowerCase()} emails`}
                        aria-describedby={`template-active-hint-${template.id}`}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Choose this template in the email composer when sending a message.</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor sheet */}
      <Sheet
        open={open}
        mobilePresentation="side"
        onOpenChange={(next) => {
          if (!next && isDirty && !window.confirm("Discard unsaved changes?")) return;
          if (!next) closeEditor();
          else setOpen(true);
        }}
      >
        <DrawerLayout
          title={editing ? "Edit template" : "New template"}
          description="Variables are replaced per candidate when the email is sent."
          className="inset-0 h-dvh max-h-none w-screen max-w-none rounded-none border-0 sm:max-w-none"
          footer={
            <>
              <SheetClose asChild>
                <Button variant="outline" disabled={isPending}>Cancel</Button>
              </SheetClose>
              <Button
                onClick={save}
                disabled={isPending || !name.trim() || !subject.trim() || !body.trim()}
              >
                {isPending ? "Saving…" : "Save template"}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Name + type row */}
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
              <div className="flex-1 space-y-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Interview invitation"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as TemplateType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Event messages</SelectLabel>
                      {SYSTEM_TEMPLATE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Manual outreach</SelectLabel>
                      {MANUAL_TEMPLATE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-4 text-muted-foreground">{templateTypeDescription(type)}</p>
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject</Label>
              <Input
                id="template-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Next steps for {{job_title}}"
              />
            </div>

            {/* Body , edit / preview tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Body</Label>
                <div className="flex rounded-md border border-border/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTab("edit")}
                    className={cn(
                      "rounded px-2.5 py-0.5 text-xs font-medium transition",
                      tab === "edit" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("preview")}
                    className={cn(
                      "rounded px-2.5 py-0.5 text-xs font-medium transition",
                      tab === "preview" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {tab === "edit" ? (
                <>
                  <RichTextEditor
                key={editorKey}
                    defaultValue={body}
                    onChange={setBody}
                    editorRef={editorRef}
                    placeholder={"Hi {{candidate_first_name}},\n\nWrite your message here…"}
                    minHeight="min(56vh,42rem)"
                  />

                  {/* Variable pills grouped */}
                  <div className="space-y-2 pt-1">
                    {VARIABLE_GROUPS.map(([group, vars]) => (
                      <div key={group}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vars.map((variable) => (
                            <button
                              key={variable.key}
                              type="button"
                              onClick={() => editorRef.current?.insertText(`{{${variable.key}}}`)}
                              className="cursor-pointer rounded-[6px] bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                              title={variable.label}
                            >
                              {`{{${variable.key}}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {unknownVariables.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Unknown variable{unknownVariables.length > 1 ? "s" : ""}:{" "}
                      {unknownVariables.map((v) => `{{${v}}}`).join(", ")}, will be sent as-is.
                    </p>
                  )}
                </>
              ) : (
                /* Preview panel */
                <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-950">
                  {subject.trim() && (
                    <p className="mb-4 border-b border-border/50 pb-3 text-[13px] font-semibold text-foreground">
                      {interpolateTemplate(subject, previewValues)}
                    </p>
                  )}
                  {body ? (
                    <div
                      className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-p:my-2 prose-ul:my-2 prose-ol:my-2"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          interpolateTemplate(body, previewValues),
                          { ALLOWED_TAGS: ["p","br","strong","em","s","ul","ol","li","h1","h2","blockquote","a"], ALLOWED_ATTR: ["href"] },
                        ),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DrawerLayout>
      </Sheet>
    </div>
  );
}
