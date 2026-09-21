import type { Action } from "../schema";

export const BOOKING_INVITATION_MESSAGE = {
  subject: "Choose an interview time for {{job.title}}",
  body: "Hi {{candidate.firstName}},\n\nWe'd like to invite you to an interview for {{job.title}} with Talmore.\n\nPlease use the button below to choose a time that works for you. You'll receive a calendar invitation with the interview details once your booking is confirmed.\n\nIf none of the available times work, reply to this email and we'll help arrange another time.\n\nBest,\nThe Talmore team",
};

export function prefillBookingMessage(action: Action): Action {
  if (action.type !== "send_booking_invitation") return action;
  return {
    ...action,
    config: {
      ...action.config,
      subject:
        typeof action.config.subject === "string" &&
        action.config.subject.trim()
          ? action.config.subject
          : BOOKING_INVITATION_MESSAGE.subject,
      body:
        typeof action.config.body === "string" && action.config.body.trim()
          ? action.config.body
          : BOOKING_INVITATION_MESSAGE.body,
    },
  };
}
