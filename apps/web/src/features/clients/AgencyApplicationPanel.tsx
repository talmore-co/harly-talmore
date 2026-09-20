"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { OffersPanel } from "@/features/offers/OffersPanel";
import { OfferDrawer } from "@/features/offers/OfferDrawer";
import {
  OFFER_STATUS_META,
  type CandidateOfferItem,
} from "@/features/offers/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/notification-island/toast";
import { updateApplicationStatus } from "@/features/pipeline/actions";
import { getAgencyApplication, recordClientOffer } from "./application-actions";

type Data = Awaited<ReturnType<typeof getAgencyApplication>>;
type Props = {
  applications: { id: string; jobTitle: string }[];
  offers: CandidateOfferItem[];
  documents: { id: string; name: string; mimeType: string }[];
  offerSignatureChannel: "email" | "esign" | "native";
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function AgencyApplicationPanel({ applications, ...props }: Props) {
  const selectedId = useSearchParams().get("applicationId");
  const applicationId = applications.some(
    (application) => application.id === selectedId,
  )
    ? selectedId
    : (applications[0]?.id ?? "");
  return (
    <section className="space-y-4">
      {applicationId ? (
        <ApplicationDetails
          key={applicationId}
          applicationId={applicationId}
          applications={applications.filter(
            (item) => item.id === applicationId,
          )}
          {...props}
          offers={props.offers.filter(
            (offer) => offer.applicationId === applicationId,
          )}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Add the candidate to a job first.
        </p>
      )}
    </section>
  );
}
function ApplicationDetails({
  applicationId,
  applications,
  offers,
  documents,
  offerSignatureChannel,
}: Props & { applicationId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<"offer" | "placement" | null>(null);
  const [editingOffer, setEditingOffer] = useState<
    Data["offers"][number] | undefined
  >();
  const [offerKind, setOfferKind] = useState("client");
  const [sentOpen, setSentOpen] = useState(false);
  const [viewingOffer, setViewingOffer] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [clientFilter, setClientFilter] = useState(FILTER_ALL);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    getAgencyApplication(applicationId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, version, offers]);
  if (error)
    return <p role="alert">Could not load this application’s records.</p>;
  if (!data)
    return <p className="text-sm text-muted-foreground">Loading records…</p>;
  const refresh = () => {
    setDialog(null);
    setVersion((v) => v + 1);
    router.refresh();
  };
  const clientName = data.clientName ?? "No client assigned";
  const clients = Array.from(new Set([clientName, ...data.offers.map((offer) => offer.clientName)])).sort((a, b) => a.localeCompare(b));
  const matches = (type: string, status: string, client: string, details: string, date: string) =>
    (typeFilter === FILTER_ALL || typeFilter === type) &&
    (statusFilter === FILTER_ALL || statusFilter === status) &&
    (clientFilter === FILTER_ALL || clientFilter === client) &&
    [type, status, client, details, date].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const showPlacement = Boolean(data.status === "hired" || data.hiredOn) && matches("Placement", data.status === "hired" ? "hired" : "reopened", clientName, data.hireTerms ?? "", data.hiredOn ?? "");
  const clientRows = data.offers.filter((offer) => matches("Client offer", offer.status, offer.clientName, offer.terms ?? "", offer.offeredOn));
  const talmoreRows = offers.filter((offer) => matches("Talmore offer", offer.status, clientName, `${offer.title} ${offer.notes ?? ""}`, offer.createdAt.slice(0, 10)));
  const visibleCount = Number(showPlacement) + clientRows.length + talmoreRows.length;
  const totalCount = Number(Boolean(data.status === "hired" || data.hiredOn)) + data.offers.length + offers.length;
  const filtersActive = Boolean(query.trim()) || [typeFilter, statusFilter, clientFilter].some((value) => value !== FILTER_ALL);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Offers & placements</h2>
          <p className="text-sm text-muted-foreground">
            {data.clientName ?? "No client assigned"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.canManageOffers ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingOffer(undefined);
                setOfferKind(data.clientId ? "client" : "talmore");
                setDialog("offer");
              }}
            >
              Create offer
            </Button>
          ) : null}
          {data.canEdit && data.status !== "hired" && !data.hiredOn ? (
            <Button size="sm" onClick={() => setDialog("placement")}>
              Create placement
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" aria-label="Search offers and placements" placeholder="Search offers, clients or terms…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full sm:w-72" />
        <FilterPill label="Type" value={typeFilter} onChange={setTypeFilter} options={["Client offer", "Talmore offer", "Placement"]} />
        <FilterPill label="Status" value={statusFilter} onChange={setStatusFilter} options={["draft", "pending", "sent", "accepted", "declined", "withdrawn", "expired", "hired", "reopened"]} labelMap={{ draft: "Draft", pending: "Pending", sent: "Sent", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn", expired: "Expired", hired: "Hired", reopened: "Reopened" }} />
        <FilterPill label="Client" value={clientFilter} onChange={setClientFilter} options={clients} />
        {filtersActive ? <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setTypeFilter(FILTER_ALL); setStatusFilter(FILTER_ALL); setClientFilter(FILTER_ALL); }}>Clear filters</Button> : null}
        <span className="text-xs text-muted-foreground sm:ml-auto">{visibleCount} of {totalCount} records</span>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
            <tr>
              {["Type", "Date", "Client", "Details", "Status", ""].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">
                  {label || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {showPlacement ? (
              <tr>
                <td className="px-4 py-3 font-medium">Placement</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {data.hiredOn ?? "Not recorded"}
                </td>
                <td className="px-4 py-3">{clientName}</td>
                <td className="max-w-xs truncate px-4 py-3">
                  {data.hireTerms || "No terms recorded"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">
                    {data.status === "hired" ? "Hired" : "Reopened"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialog("placement")}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ) : null}
            {clientRows.map((offer) => (
              <tr key={offer.id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  Client offer
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {offer.offeredOn}
                </td>
                <td className="px-4 py-3">
                  {offer.clientName}
                </td>
                <td className="max-w-xs truncate px-4 py-3" title={offer.terms ?? undefined}>{offer.terms || "No terms recorded"}</td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="capitalize">
                    {offer.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingOffer(offer);
                      setOfferKind("client");
                      setDialog("offer");
                    }}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
            {talmoreRows.map((offer) => (
              <tr key={offer.id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  Talmore offer
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {offer.createdAt.slice(0, 10)}
                </td>
                <td className="px-4 py-3">{clientName}</td>
                <td className="max-w-xs truncate px-4 py-3">{offer.title}</td>
                <td className="px-4 py-3">
                  <Badge variant={OFFER_STATUS_META[offer.status].variant}>
                    {OFFER_STATUS_META[offer.status].label}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewingOffer(offer.id)}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
            {!visibleCount ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {filtersActive ? "No offers or placements match your filters." : "No offers or placements recorded."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog === "placement"
                ? data.status === "hired" || data.hiredOn
                  ? "Placement details"
                  : "Create placement"
                : editingOffer
                  ? "Client offer details"
                  : "Create offer"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "placement"
                ? "Record the confirmed hire and any known terms."
                : "Record a client offer internally, or prepare an offer to send through Talmore."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "placement" ? (
            <HireForm
              key={`hire-${version}`}
              applicationId={applicationId}
              data={data}
              onSaved={refresh}
            />
          ) : dialog === "offer" ? (
            <div className="space-y-4">
              {!editingOffer ? (
                <Select value={offerKind} onValueChange={setOfferKind}>
                  <SelectTrigger aria-label="Offer type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client" disabled={!data.clientId}>
                      Client offer · internal record
                    </SelectItem>
                    <SelectItem value="talmore">
                      Offer to send through Talmore
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {offerKind === "client" ? (
                <ClientOfferForm
                  key={editingOffer?.id ?? "new"}
                  applicationId={applicationId}
                  offer={editingOffer}
                  disabled={!data.canManageOffers}
                  onSaved={refresh}
                />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Create a draft to review before sending it to the candidate.
                  </p>
                  <Button
                    onClick={() => {
                      setDialog(null);
                      setSentOpen(true);
                    }}
                  >
                    Continue
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <OfferDrawer
        open={sentOpen}
        onOpenChange={setSentOpen}
        applications={applications}
        documents={documents}
        offer={null}
      />
      <Dialog
        open={Boolean(viewingOffer)}
        onOpenChange={(open) => {
          if (!open) setViewingOffer(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Talmore offer</DialogTitle>
            <DialogDescription>
              Review the offer and manage its status.
            </DialogDescription>
          </DialogHeader>
          <OffersPanel
            offers={offers.filter((offer) => offer.id === viewingOffer)}
            applications={applications}
            documents={documents}
            offerSignatureChannel={offerSignatureChannel}
            hideCreate
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
function HireForm({
  applicationId,
  data,
  onSaved,
}: {
  applicationId: string;
  data: Data;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateApplicationStatus({
            applicationIds: [applicationId],
            workspaceId: data.workspaceId,
            status: "hired",
            hireDetails: {
              hiredOn: String(fields.get("hiredOn")),
              hireTerms: String(fields.get("hireTerms")),
            },
          });
          if (!result.success) return void toast.error(result.error);
          toast.success("Placement saved");
          onSaved();
        });
      }}
    >
      <p className="text-xs text-muted-foreground">
        Saving a placement marks this application as hired. No offer is required.
      </p>
      <fieldset disabled={pending || !data.canEdit} className="space-y-3">
        <label className="flex flex-col items-start gap-2 text-sm">
          <span>Hire date</span>
          <DatePicker
            className="max-w-xs"
            name="hiredOn"
            required
            defaultValue={data.hiredOn ?? today()}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Placement confirmation date, not the first day of work.
        </p>
        <label className="flex flex-col gap-2 text-sm">
          <span>
            Terms / start date{" "}
            <span className="font-normal text-muted-foreground">
              · optional
            </span>
          </span>
          <Textarea
            name="hireTerms"
            rows={3}
            maxLength={10000}
            defaultValue={data.hireTerms ?? ""}
            placeholder="Known terms, start date or placement notes"
          />
        </label>
        {data.canEdit ? (
          <Button type="submit">
            {pending
              ? "Saving…"
              : data.status === "hired"
                ? "Save hire details"
                : "Create placement"}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
function ClientOfferForm({
  applicationId,
  offer,
  disabled = false,
  onSaved,
}: {
  applicationId: string;
  offer?: Data["offers"][number];
  disabled?: boolean;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(offer?.status ?? "pending");
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await recordClientOffer({
            id: offer?.id,
            applicationId,
            offeredOn: String(fields.get("offeredOn")),
            terms: String(fields.get("terms")),
            status: status as "pending" | "accepted" | "declined" | "withdrawn",
          });
          if (!result.success) return void toast.error(result.error);
          toast.success("Client offer recorded");
          onSaved();
        });
      }}
    >
      <fieldset disabled={disabled || pending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Offer date
            <DatePicker
              name="offeredOn"
              required
              defaultValue={offer?.offeredOn ?? today()}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Decision
            <Select
              disabled={disabled || pending}
              value={status}
              onValueChange={setStatus}
            >
              <SelectTrigger
                className="w-full"
                aria-label="Client offer decision"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["pending", "accepted", "declined", "withdrawn"].map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </label>
        </div>
        <label className="flex flex-col gap-2 text-sm">
          Known terms · optional
          <Textarea
            name="terms"
            maxLength={10000}
            defaultValue={offer?.terms ?? ""}
            placeholder="Salary, start date and other terms, if known"
          />
        </label>
        {!disabled ? (
          <Button type="submit" variant="outline">
            {pending
              ? "Saving…"
              : offer
                ? "Save client offer"
                : "Record client offer"}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
