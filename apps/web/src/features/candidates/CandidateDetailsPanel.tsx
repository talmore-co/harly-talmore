"use client";
import { EvaluationDrawer } from "./EvaluationDrawer";
import { ScorecardList } from "./candidate-profile/ScorecardList";
import { countAssessments } from "./assessment-counts";
import { QuestionnaireScoreDetails } from "./QuestionnaireScoreDetails";
import { ApplicationAttributionDetails } from "./ApplicationAttributionDetails";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Briefcase,
  Building,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Layers,
  Mail,
  Megaphone,
  MessageSquareText,
  MousePointerClick,
  Phone,
  Sparkles,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
  ResumeEducationItem,
  ResumeExperienceItem,
} from "@harly/db";

import {
  CandidateFileUpload,
  type CandidateFileItem,
} from "@/features/candidates/CandidateFileUpload";
import { EducationList } from "@/features/candidates/EducationList";
import { ExperienceTimeline } from "@/features/candidates/ExperienceTimeline";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShortDate } from "@/lib/date-hydration";
import { PipelineScores } from "@/features/pipeline/PipelineScores";
import { MetaAttributionBadge } from "@/features/pipeline/MetaAttributionBadge";
import { AiScoreCard } from "./AiScoreCard";
import type { CandidateAiEvaluationItem } from "./data";

type Application = {
  id: string;
  jobId: string;
  jobTitle: string;
  clientName?: string | null;
  currentStageName: string | null;
  status: string;
  appliedAt: string;
  source: string | null;
  questionnaireScore?: number | null;
  questionnaireScoreSnapshot?: unknown;
  attribution?: unknown;
  answers: Array<{ id: string; label: string; type: string; answer: string }>;
};

const APPLICATION_SOURCE_META: Record<
  string,
  { label: string; icon: typeof Briefcase }
> = {
  public_form: { label: "Job board", icon: Briefcase },
  csv_import: { label: "CSV import", icon: FileSpreadsheet },
  talentsourcer: { label: "TalentSourcer AI", icon: FileSpreadsheet },
  referral: { label: "Referral", icon: Users },
  linkedin: { label: "LinkedIn", icon: Briefcase },
  career_page: { label: "Career page", icon: Globe },
  agency: { label: "Agency", icon: Building },
  direct_apply: { label: "Direct apply", icon: MousePointerClick },
  internal: { label: "Internal", icon: UserPlus },
  email: { label: "Email", icon: Mail },
  event: { label: "Event", icon: Megaphone },
  manual: { label: "Manual", icon: Upload },
};

function SectionLabel({
  children,
  meta,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <p className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{children}</span>
      {meta ? (
        <span className="font-medium normal-case tracking-normal text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </p>
  );
}

function Section({
  children,
  hidden,
}: {
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return <section className="px-5 py-5 sm:px-6">{children}</section>;
}

function SkillsList({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;
  const visible = skills.slice(0, 18);
  const overflow = skills.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((skill) => (
        <Badge key={skill} variant="outline" className="font-normal text-foreground/80">
          {skill}
        </Badge>
      ))}
      {overflow > 0 ? (
        <Badge variant="outline">+{overflow}</Badge>
      ) : null}
    </div>
  );
}

function ExperienceHeadline({ years }: { years: number | null }) {
  if (years === null) return null;
  return (
    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/90">
      <Sparkles className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
      {years}+ years of experience
    </p>
  );
}

function ApplicationMetaItem({
  icon: Icon,
  children,
}: {
  icon: typeof Calendar;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3 shrink-0" strokeWidth={1.8} />
      {children}
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{value}</dd>
    </>
  );
}

type AssessmentContext = {
  scorecards: import("./candidate-profile/types").Scorecard[];
  interviews: import("@/features/interviews/shared").CandidateInterviewItem[];
  candidateId: string;
  workspaceId: string;
};

function ApplicationDisclosure({
  application,
  evaluation,
  aiConfigured,
  scorecards, interviews, candidateId, workspaceId,
}: {
  application: Application;
  evaluation?: CandidateAiEvaluationItem;
  aiConfigured: boolean;
} & AssessmentContext) {
  const [open, setOpen] = useState(false);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [assessmentsOpen, setAssessmentsOpen] = useState(false);
  const hasAnswers = application.answers.length > 0;
  const sourceMeta = application.source
    ? APPLICATION_SOURCE_META[application.source]
    : null;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
        {application.clientName ? <p className="mb-1 truncate pl-[2.4rem] text-xs text-muted-foreground">{application.clientName}</p> : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Briefcase className="size-3.5" strokeWidth={1.8} />
          </span>
          <h3 className="truncate text-sm font-medium text-foreground">
            {application.jobTitle}
          </h3>
          <ApplicationStatusBadge status={application.status as never} />
        </div>
        <div className="mt-1.5 flex items-center gap-1 pl-[2.4rem] text-xs text-muted-foreground">
          <span>{sourceMeta?.label ?? application.source ?? "Source not recorded"}</span>
          <MetaAttributionBadge value={application.attribution} />
        </div>
        </div>
        <div className="flex flex-col items-start gap-1.5">
        {application.currentStageName ? (
          <ApplicationMetaItem icon={Layers}>
            {application.currentStageName}
          </ApplicationMetaItem>
        ) : null}
        <ApplicationMetaItem icon={Calendar}>
          Applied <ShortDate value={application.appliedAt} />
        </ApplicationMetaItem>
        </div>
        <PipelineScores application={{ questionnaireScore: application.questionnaireScore, aiScore: evaluation?.score, assessmentCounts: countAssessments(scorecards) }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {hasAnswers ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} questionnaire answers for ${application.jobTitle}`}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <MessageSquareText className="size-3 shrink-0" strokeWidth={1.8} />
            {application.answers.length} answer
            {application.answers.length === 1 ? "" : "s"}
            {open ? (
              <ChevronUp className="size-3 shrink-0" strokeWidth={2} />
            ) : (
              <ChevronDown className="size-3 shrink-0" strokeWidth={2} />
            )}
          </button>
        ) : null}
        <button type="button" onClick={() => setEvaluationOpen((value) => !value)} aria-expanded={evaluationOpen} aria-label={`${evaluationOpen ? "Hide" : "Show"} AI evaluation for ${application.jobTitle}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Sparkles className="size-3" />AI evaluation{evaluationOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        <button type="button" onClick={() => setSourceOpen((value) => !value)} aria-expanded={sourceOpen} aria-label={`${sourceOpen ? "Hide" : "Show"} source for ${application.jobTitle}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Globe className="size-3" />Source{sourceOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        <button type="button" onClick={() => setAssessmentsOpen((value) => !value)} aria-expanded={assessmentsOpen} aria-label={`${assessmentsOpen ? "Hide" : "Show"} team assessments for ${application.jobTitle}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <MessageSquareText className="size-3" />Team assessments ({scorecards.length}){assessmentsOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        <Button asChild variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground">
          <Link href={`/dashboard/pipeline?jobId=${application.jobId}` as Route}><ExternalLink className="size-3.5" />Pipeline</Link>
        </Button>
      </div>

      {sourceOpen ? <div className="mt-3">
        <ApplicationAttributionDetails value={application.attribution} sourceLabel={sourceMeta?.label ?? application.source ?? "Not recorded"} />
      </div> : null}
      {assessmentsOpen ? <section className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{scorecards.length ? "Team assessments for this application" : "No team assessments for this application yet."}</p>
          <EvaluationDrawer candidateId={candidateId} workspaceId={workspaceId} applicationId={application.id} jobTitle={application.jobTitle} clientName={application.clientName} stageName={application.currentStageName} trigger={<Button size="sm" variant="outline">Add assessment</Button>} />
        </div>
        <ScorecardList scorecards={scorecards} application={application} interviews={interviews} />
      </section> : null}
      {evaluationOpen ? <div className="mt-3"><AiScoreCard applications={[{ id: application.id, jobTitle: application.jobTitle }]} evaluations={evaluation ? [evaluation] : []} aiConfigured={aiConfigured} /></div> : null}
      {open ? <QuestionnaireScoreDetails snapshot={application.questionnaireScoreSnapshot} /> : null}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open && hasAnswers ? "1fr" : "0fr" }}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <dl className="mt-3 space-y-3 rounded-md border border-border/70 bg-muted/25 p-4">
            {application.answers.map((answer) => (
              <div key={answer.id} className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {answer.label}
                </dt>
                <dd className="whitespace-pre-line text-sm leading-6 text-foreground/90">
                  {answer.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export function CandidateApplicationsPanel({ applications, evaluations, aiConfigured, scorecards, interviews, candidateId, workspaceId }: { applications: Application[]; evaluations: CandidateAiEvaluationItem[]; aiConfigured: boolean } & AssessmentContext) {
  return (
    <section className="rounded-lg border border-border bg-card px-5 py-5 sm:px-6">
      <SectionLabel meta={`${applications.length} total`}>Applications</SectionLabel>
      {applications.length ? (
        <div className="mt-4 divide-y divide-border/60">
          {applications.map((application) => <ApplicationDisclosure key={application.id} application={application} evaluation={evaluations.find((item) => item.applicationId === application.id)} aiConfigured={aiConfigured} scorecards={scorecards.filter((item) => item.applicationId === application.id)} interviews={interviews} candidateId={candidateId} workspaceId={workspaceId} />)}
        </div>
      ) : <p className="mt-3 text-sm text-muted-foreground">No applications yet.</p>}
    </section>
  );
}

export type CandidateDetailsPanelProps = {
  candidateId: string;
  workspaceId: string;
  files: CandidateFileItem[];
  email: string;
  phone: string | null;
  address: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  summary: string | null;
  educationEntries: CandidateEducationEntry[];
  experienceEntries: CandidateExperienceEntry[];
};

export function CandidateDetailsPanel({
  candidateId,
  workspaceId,
  files,
  email,
  phone,
  address,
  linkedinUrl,
  githubUrl,
  websiteUrl,
  summary,
  educationEntries,
  experienceEntries,
}: CandidateDetailsPanelProps) {
  const [open, setOpen] = useState(true);
  const latestFile = files[0] ?? null;
  const resumeSummary = latestFile?.parsedSummary ?? null;
  const profileSummary = summary ?? resumeSummary;
  const skills = latestFile?.parsedSkills ?? [];
  const experienceYears = latestFile?.parsedExperienceYears ?? null;
  const resumeExperience: ResumeExperienceItem[] = latestFile?.parsedExperience ?? [];
  const resumeEducation: ResumeEducationItem[] = latestFile?.parsedEducationItems ?? [];
  const experience =
    experienceEntries.length > 0 ? experienceEntries : resumeExperience;
  const education = educationEntries.length > 0 ? educationEntries : resumeEducation;
  const educationFallback = latestFile?.parsedEducation ?? null;
  const hasContactDetails = Boolean(
    email || phone || address || linkedinUrl || githubUrl || websiteUrl,
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm shadow-black/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 bg-muted/40 px-5 py-3.5 text-left sm:px-6"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold">Details</span>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" strokeWidth={1.8} />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" strokeWidth={1.8} />
        )}
      </button>

      {open ? (
        <div className="divide-y divide-border/70 border-t bg-card">
          <Section hidden={!hasContactDetails}>
            <SectionLabel>Contact details</SectionLabel>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <DetailRow
                label="Email"
                value={
                  email ? <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                  >
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                    {email}
                  </a> : "No email"
                }
              />
              {phone ? (
                <DetailRow
                  label="Phone"
                  value={
                    <a
                      href={`tel:${phone}`}
                      className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-primary"
                    >
                      <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                      {phone}
                    </a>
                  }
                />
              ) : null}
              {address ? (
                <DetailRow
                  label="Address"
                  value={
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-primary"
                    >
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                      {address}
                    </a>
                  }
                />
              ) : null}
              {linkedinUrl ? (
                <DetailRow
                  label="LinkedIn"
                  value={
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                      {linkedinUrl}
                    </a>
                  }
                />
              ) : null}
              {githubUrl ? (
                <DetailRow
                  label="GitHub"
                  value={
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                      {githubUrl}
                    </a>
                  }
                />
              ) : null}
              {websiteUrl ? (
                <DetailRow
                  label="Website"
                  value={
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                      {websiteUrl}
                    </a>
                  }
                />
              ) : null}
            </dl>
          </Section>

          <Section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>Resume</SectionLabel>
              <p className="text-xs text-muted-foreground">{files.length} {files.length === 1 ? "file" : "files"}</p>
            </div>
            <div className="mt-4"><CandidateFileUpload candidateId={candidateId} workspaceId={workspaceId} initialFiles={files} /></div>
          </Section>
          <Section hidden={!profileSummary}>
            <SectionLabel>Profile summary</SectionLabel>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-foreground/85">{profileSummary}</p>
          </Section>
          <Section hidden={!summary || !resumeSummary || summary === resumeSummary}>
            <SectionLabel>Resume summary</SectionLabel>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-foreground/85">{resumeSummary}</p>
          </Section>
          <Section hidden={experience.length === 0}>
            <SectionLabel meta={`${experience.length} entries`}>Work experience</SectionLabel>
            <div className="mt-4"><ExperienceTimeline experience={experience} /></div>
          </Section>
          <Section hidden={education.length === 0 && !educationFallback && experienceYears === null}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>Education</SectionLabel>
              <ExperienceHeadline years={experienceYears} />
            </div>
            <div className="mt-4"><EducationList education={education} fallback={educationFallback} /></div>
          </Section>
          <Section hidden={skills.length === 0}>
            <SectionLabel>Skills</SectionLabel>
            <div className="mt-4"><SkillsList skills={skills} /></div>
          </Section>
        </div>
      ) : null}
    </section>
  );
}
