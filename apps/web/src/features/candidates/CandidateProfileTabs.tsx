"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  CalendarClock,
  Mail,
  MessageSquare,
  Plus,
} from "lucide-react";

import { CandidateDetailsPanel, CandidateApplicationsPanel } from "@/features/candidates/CandidateDetailsPanel";
import { EmailDrawer } from "@/features/candidates/EmailDrawer";
import { NoteForm } from "@/features/candidates/NoteForm";
import { ScheduleDrawer } from "@/features/candidates/ScheduleDrawer";
import { RecordInterviewDialog } from "@/features/candidates/RecordInterviewDialog";
import { CallHistory, LogCallDialog } from "./CallLog";
import { AgencyApplicationPanel } from "@/features/clients/AgencyApplicationPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ActivityTimeline } from "./candidate-profile/ActivityTimeline";
import { ConversationThread } from "./candidate-profile/ConversationThread";
import { DocumentsSection } from "./candidate-profile/DocumentsSection";
import { InterviewCard } from "./candidate-profile/InterviewCard";
import { PrivacyRequestCard } from "./candidate-profile/PrivacyRequestCard";
import { CandidateSignaturePanel } from "./candidate-profile/SignaturePanel";
import { EmptySection, TabCount } from "./candidate-profile/shared";
import type {
  CandidateMessage,
  CandidateProfileTabsProps,
} from "./candidate-profile/types";

/** Groups a flat message list into threads, oldest message first inside each. */
function groupIntoConversations(messages: CandidateMessage[]) {
  const threads = messages.reduce((groups, message) => {
    const key = message.threadId ?? `legacy:${message.id}`;
    const group = groups.get(key) ?? [];
    group.push(message);
    groups.set(key, group);
    return groups;
  }, new Map<string, CandidateMessage[]>());

  return Array.from(threads.values()).map((group) =>
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export function CandidateProfileTabs({
  candidateId,
  workspaceId,
  candidateEmail,
  candidateName,
  candidatePhone,
  candidateAddress,
  candidateLinkedinUrl,
  candidateGithubUrl,
  candidateWebsiteUrl,
  candidateSummary,
  candidateEducationEntries,
  candidateExperienceEntries,
  applications,
  notes,
  files,
  relatedDocuments,
  signableDocuments,
  documentRequests,
  canManageDocuments,
  activity,
  scorecards,
  messages,
  calls = [],
  interviews,
  members,
  aiEvaluations,
  aiConfigured,
  offers,
  offerSignatureChannel,
  emailTemplates = [],
  emailTemplateValues = {},
  scheduleApplications,
  scheduleMembers,
  scheduleCal,
  currentUserId,
  privacyRequests = [],
  canFulfilErasure = false,
}: CandidateProfileTabsProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requestedTab = searchParams.get("tab") === "evaluation" ? "applications" : searchParams.get("tab") ?? "profile";
  const tab = ["profile", "applications", "interviews", "communication", "offers", "activity", "documents", "privacy"].includes(requestedTab) ? requestedTab : "profile";
  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params}` as Route, { scroll: false });
  };
  const [signatureOpen, setSignatureOpen] = useState(false);
  const conversations = groupIntoConversations(messages);
  const jobOptions = applications.map((application) => ({
    id: application.id,
    jobTitle: application.jobTitle,
  }));

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {/*
        Flat, exclusive tabs, one module per tab (DESIGN.md , Candidate Focus:
        complex-workspace exception). Each tab is its own independent
        functional module, not a rung in a decision hierarchy, so grouping
        them under 3 umbrella tabs just stacked unrelated TabsContent blocks
        on top of each other and produced a single endless-scroll page. Flat
        tabs keep each module reachable in one click and scoped to its own
        content.
      */}
      <TabsList
        variant="line"
        className="w-full justify-start gap-5 overflow-x-auto border-b border-hairline text-sm [&>button]:flex-none [&>button]:px-0.5"
      >
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="applications">Applications<TabCount value={applications.length} /></TabsTrigger>
        <TabsTrigger value="interviews">
          Interviews
          <TabCount value={interviews.length} />
        </TabsTrigger>
        <TabsTrigger value="communication">
          Communication
          <TabCount value={messages.length + calls.length} />
        </TabsTrigger>
        <TabsTrigger value="offers">
          Offers & hire
          <TabCount value={offers.length} />
        </TabsTrigger>
        <TabsTrigger value="activity">
          Notes &amp; activity
          <TabCount value={activity.length + notes.length} />
        </TabsTrigger>
        <TabsTrigger value="documents">
          Documents
          <TabCount value={relatedDocuments.length} />
        </TabsTrigger>
        {privacyRequests.length > 0 ? (
          <TabsTrigger value="privacy">
            Privacy
            <TabCount value={privacyRequests.length} />
          </TabsTrigger>
        ) : null}
      </TabsList>

      {/* ── Profile ── */}
      <TabsContent value="profile" className="mt-5 space-y-4">
        <CandidateDetailsPanel
          candidateId={candidateId}
          workspaceId={workspaceId}
          files={files}
          email={candidateEmail}
          phone={candidatePhone}
          address={candidateAddress}
          linkedinUrl={candidateLinkedinUrl}
          githubUrl={candidateGithubUrl}
          websiteUrl={candidateWebsiteUrl}
          summary={candidateSummary}
          educationEntries={candidateEducationEntries}
          experienceEntries={candidateExperienceEntries}
        />
      </TabsContent>

      <TabsContent value="applications" className="mt-5 space-y-4">
        <CandidateApplicationsPanel applications={applications} evaluations={aiEvaluations} aiConfigured={aiConfigured} scorecards={scorecards} interviews={interviews} candidateId={candidateId} workspaceId={workspaceId} />
      </TabsContent>

      {/* ── Interviews ── */}
      <TabsContent value="interviews" className="mt-4 space-y-3">
        <div className="flex flex-wrap justify-end gap-2">
          <RecordInterviewDialog candidateId={candidateId} applications={scheduleApplications} members={scheduleMembers} currentUserId={currentUserId} />
          <ScheduleDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            candidateName={candidateName}
            candidateEmail={candidateEmail}
            applications={scheduleApplications}
            members={scheduleMembers}
            cal={scheduleCal}
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                Schedule interview
              </Button>
            }
          />
        </div>
        {interviews.length === 0 ? (
          <EmptySection
            icon={CalendarClock}
            title="No interviews yet"
            hint="Schedule an upcoming interview or record one that already happened."
          />
        ) : (
          <div className="space-y-3 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {interviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                candidateId={candidateId}
                workspaceId={workspaceId}
                members={scheduleMembers}
                currentUserId={currentUserId}
                aiConfigured={aiConfigured}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Communication ── */}
      <TabsContent value="communication" className="mt-4 space-y-3">
        <div className="flex flex-wrap justify-end gap-2">
          <LogCallDialog candidateId={candidateId} applications={jobOptions.map((app) => ({ id: app.id, title: app.jobTitle }))} selectedApplicationId={searchParams.get("applicationId")} />
          <EmailDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            email={candidateEmail}
            name={candidateName}
            templates={emailTemplates}
            templateValues={emailTemplateValues}
            aiConfigured={aiConfigured}
            trigger={
              <Button size="sm">
                <Mail className="size-4" />
                New message
              </Button>
            }
          />
        </div>
        <CallHistory calls={calls} applications={jobOptions.map((app) => ({ id: app.id, title: app.jobTitle }))} />
        {messages.length === 0 && calls.length === 0 ? (
          <EmptySection
            icon={Mail}
            title={`No communications with ${candidateName.split(" ")[0]} yet`}
            hint="Send a message or log a phone call above. Email replies arrive in the Inbox and appear here automatically."
          />
        ) : (
          <div className="space-y-4 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {conversations.map((conversation) => (
              <ConversationThread
                key={conversation[0]!.threadId ?? `legacy:${conversation[0]!.id}`}
                conversation={conversation}
                candidateId={candidateId}
                candidateName={candidateName}
                candidateEmail={candidateEmail}
                workspaceId={workspaceId}
                aiConfigured={aiConfigured}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Offers ── */}
      <TabsContent value="offers" className="mt-5 w-full min-w-0 space-y-6">
        <AgencyApplicationPanel
          offers={offers}
          applications={jobOptions}
          documents={relatedDocuments}
          offerSignatureChannel={offerSignatureChannel}
        />
      </TabsContent>

      {/* ── Activity , notes and timeline ── */}
      <TabsContent value="activity" className="mt-4 space-y-4">
        {/* Notes always on top so the form is reachable without scrolling */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes &amp; comments
          </p>
          <NoteForm
            candidateId={candidateId}
            workspaceId={workspaceId}
            initialNotes={notes}
            members={members}
          />
        </div>

        {activity.length > 0 ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeline
            </p>
            <ActivityTimeline activity={activity} />
          </div>
        ) : null}

        {activity.length === 0 && notes.length === 0 ? (
          <EmptySection
            icon={MessageSquare}
            title="Nothing has happened yet"
            hint="Stage moves, notes, emails and interviews all land here in order, so you can see how this candidate got to where they are."
          />
        ) : null}
      </TabsContent>

      {/* ── Documents ── */}
      <TabsContent value="documents" className="mt-4 space-y-4">
        <DocumentsSection
          candidateId={candidateId}
          relatedDocuments={relatedDocuments}
          documentRequests={documentRequests}
          applications={jobOptions}
          canManageDocuments={canManageDocuments}
          hasSignableDocuments={signableDocuments.length > 0}
          onRequestSignature={() => setSignatureOpen(true)}
        />
        <CandidateSignaturePanel
          open={signatureOpen}
          onOpenChange={setSignatureOpen}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          documents={signableDocuments}
        />
      </TabsContent>

      {/*
        Privacy requests. Rendered only when one exists: a permanently
        visible "Privacy requests / none" tab is a section explaining that it
        has nothing to say, which is the same mistake the AI panels made.
      */}
      {privacyRequests.length > 0 ? (
        <TabsContent value="privacy" className="mt-4 space-y-3">
          <div className="space-y-4 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {privacyRequests.map((request) => (
              <PrivacyRequestCard
                key={request.id}
                request={request}
                candidateId={candidateId}
                candidateEmail={candidateEmail}
                canFulfilErasure={canFulfilErasure}
                inventory={{
                  applications: applications.length,
                  interviews: interviews.length,
                  messages: messages.length,
                  files: files.length,
                  notes: notes.length,
                  scorecards: scorecards.length,
                  aiEvaluations: aiEvaluations.length,
                  offers: offers.length,
                  activity: activity.length,
                }}
              />
            ))}
          </div>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
