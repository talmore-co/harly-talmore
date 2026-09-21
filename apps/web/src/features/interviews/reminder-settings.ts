import { z } from "zod";

export const DEFAULT_INTERVIEW_REMINDER = {
  enabled: false,
  hoursBefore: 24,
  timeZone: "UTC",
  calReminders: "provider" as const,
  subject: "Reminder: your interview for {{job.title}}",
  body: "Hi {{candidate.firstName}},\n\nThis is a reminder of your interview for {{job.title}} with Talmore.\n\nWhen: {{interview.when}}\nWhere: {{interview.location}}\n\nIf you need to change your interview time, please use the rescheduling link in your original invitation or reply to your recruiter.\n\nBest,\nThe Talmore team",
};

const variables = new Set([
  "candidate.firstName",
  "candidate.lastName",
  "job.title",
  "interview.when",
  "interview.location",
]);
export const interviewReminderSettingsSchema = z
  .object({
    enabled: z.boolean(),
    hoursBefore: z.number().min(0.25).max(720),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return Boolean(value);
        } catch {
          return false;
        }
      }, "Choose a valid time zone."),
    calReminders: z.enum(["provider", "talmore"]),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
  })
  .superRefine((value, context) => {
    for (const field of ["subject", "body"] as const) {
      for (const match of value[field].matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
        if (!variables.has(match[1]!))
          context.addIssue({
            code: "custom",
            path: [field],
            message: `Unknown message variable: ${match[1]}`,
          });
      }
    }
  });
export type InterviewReminderSettings = z.infer<
  typeof interviewReminderSettingsSchema
>;
export const storedInterviewReminderSettingsSchema = z.object({
  settings: interviewReminderSettingsSchema,
  revision: z.string().uuid(),
  savedAt: z.string().datetime(),
});
export type StoredInterviewReminderSettings = z.infer<
  typeof storedInterviewReminderSettingsSchema
>;
