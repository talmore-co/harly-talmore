import type { TemplateType } from "./shared";

export type TemplateStarter = {
  name: string;
  type: TemplateType;
  description: string;
  subject: string;
  body: string;
};

export const TEMPLATE_STARTERS: TemplateStarter[] = [
  {
    name: "Interview invitation", type: "interview_invite",
    description: "Share the interview time, location and joining instructions.",
    subject: "Interview invitation, {{job_title}} at {{company_name}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>Your interview for the <strong>{{job_title}}</strong> position is scheduled.</p><p><strong>Date:</strong> {{interview_date}}<br><strong>Time:</strong> {{interview_time}}<br><strong>Location:</strong> {{interview_location}}</p><p>Please contact your recruiter if you need to reschedule.</p><p>Thank you,<br>{{sender_name}}</p>",
  },
  {
    name: "Rejection", type: "rejection",
    description: "Customize the message sent when a recruiter chooses to email a rejection.",
    subject: "Your application for {{job_title}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>Thank you for your interest in the <strong>{{job_title}}</strong> position and for taking the time to apply.</p><p>We won't be progressing your application for this role. We appreciate your interest and wish you well in your search.</p><p>Thank you,<br>{{sender_name}}</p>",
  },
  {
    name: "Offer", type: "offer",
    description: "Introduce an offer and link to its details.",
    subject: "Offer letter, {{job_title}} at {{company_name}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>We're pleased to share your offer for the <strong>{{job_title}}</strong> position.</p><p>Please <a href=\"{{offer_url}}\">review your offer</a> for the employer details, compensation, response deadline and full terms.</p><p>If you have any questions, please contact your recruiter.</p><p>Thank you,<br>{{sender_name}}</p>",
  },
  {
    name: "Screening outreach", type: "screening",
    description: "Save an introductory message for manual outreach.",
    subject: "Quick intro call, {{job_title}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>We'd like to arrange an introductory call about the <strong>{{job_title}}</strong> position.</p><p>Please share your availability and timezone so we can agree on a suitable time.</p><p>Thank you,<br>{{sender_name}}</p>",
  },
  {
    name: "Stage update", type: "stage_change",
    description: "Save an application update to send manually from the email composer.",
    subject: "Your application update, {{job_title}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>Your application for <strong>{{job_title}}</strong> is now in the <strong>{{stage_name}}</strong> stage.</p><p>Please contact your recruiter if you have any questions.</p><p>Thank you,<br>{{sender_name}}</p>",
  },
];
