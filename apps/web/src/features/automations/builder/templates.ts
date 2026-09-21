import type { WorkflowDefinitionInput } from "../schema";
import { BOOKING_INVITATION_MESSAGE } from "./message-defaults";

export type WorkflowTemplate = {
  id: string; name: string; description: string;
  category: "Pipeline" | "Notification" | "Triage" | "Onboarding";
  build: () => WorkflowDefinitionInput;
};

/** Starters only. Every trigger, condition and action remains editable in the builder. */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "questionnaire-progression", name: "Advance applicants by questionnaire score", category: "Pipeline",
    description: "Start with a 70% questionnaire threshold and advance to Screening. Change the score, job and stage before publishing.",
    build: () => ({ name: "Advance applicants by questionnaire score", enabled: false, trigger: { event: "application.created" },
      conditions: [
        { type: "leaf", field: { kind: "application", path: "questionnaireScore" }, op: "gte", value: 70 },
        { type: "leaf", field: { kind: "application", path: "stage" }, op: "eq", value: "Applied" },
      ],
      actions: [{ type: "move_stage", config: { toStageName: "Screening" }, continueOnError: false }],
    }),
  },
  {
    id: "score-to-booking", name: "Invite high-fit applicants to book", category: "Pipeline",
    description: "After AI evaluation, check AI and questionnaire scores, advance to Interview and email a booking link. Choose your interviewer.",
    build: () => ({ name: "Invite high-fit applicants to book", enabled: false, trigger: { event: "application.evaluated" },
      conditions: [
        { type: "leaf", field: { kind: "ai", path: "score" }, op: "gte", value: 80 },
        { type: "leaf", field: { kind: "ai", path: "source" }, op: "eq", value: "ai" },
        { type: "leaf", field: { kind: "application", path: "questionnaireScore" }, op: "gte", value: 70 },
        { type: "leaf", field: { kind: "application", path: "stage" }, op: "in", value: ["Applied", "Screening"] },
      ],
      actions: [
        { type: "move_stage", config: { toStageName: "Interview" }, continueOnError: false },
        { type: "send_booking_invitation", config: { interviewerIds: [], ...BOOKING_INVITATION_MESSAGE }, continueOnError: false },
      ],
    }),
  },
  {
    id: "booking-followup", name: "Follow up on unanswered booking invitations", category: "Notification",
    description: "After 48 hours, resend the booking link if no interview exists and the application has stayed in the invitation stage.",
    build: () => ({ name: "Follow up on unanswered booking invitations", enabled: false, trigger: { event: "booking.followup_due", offsetHours: 48 }, conditions: [],
      actions: [{ type: "send_booking_followup", config: { subject: "Choose your interview time for {{job.title}}", body: "Hi {{candidate.firstName}},\n\nWe are following up on your interview invitation for {{job.title}}. If you are still interested, please choose a time using the button below.\n\nThe Talmore team" }, continueOnError: false }],
    }),
  },
];

export function getTemplate(id: string) { return WORKFLOW_TEMPLATES.find((template) => template.id === id); }
