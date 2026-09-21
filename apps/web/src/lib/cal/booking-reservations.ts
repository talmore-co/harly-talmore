import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  automationBookingInvitations,
  db,
  personalCalConnections,
  personalCalEvents,
} from "@harly/db";

export async function hasBookingReservation(
  executor: Pick<typeof db, "select">,
  input: {
    workspaceId: string;
    interviewerId: string;
    when: Date;
    durationMins: number;
  },
) {
  const [row] = await executor
    .select({ id: automationBookingInvitations.id })
    .from(automationBookingInvitations)
    .innerJoin(
      personalCalEvents,
      eq(personalCalEvents.id, automationBookingInvitations.selectedEventId),
    )
    .innerJoin(
      personalCalConnections,
      eq(personalCalConnections.id, personalCalEvents.connectionId),
    )
    .where(
      and(
        eq(automationBookingInvitations.workspaceId, input.workspaceId),
        eq(personalCalConnections.userId, input.interviewerId),
        inArray(automationBookingInvitations.bookingState, [
          "booking",
          "review",
        ]),
        sql`${automationBookingInvitations.bookingStartAt} < ${new Date(input.when.getTime() + input.durationMins * 60000).toISOString()}`,
        sql`${automationBookingInvitations.bookingStartAt} + (${automationBookingInvitations.durationMins} * interval '1 minute') > ${input.when.toISOString()}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}
