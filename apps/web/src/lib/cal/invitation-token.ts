import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function signBookingInvitation(id: string, secret: string) {
  return `${id}.${createHmac("sha256", secret).update(`talmore-booking-invitation:${id}`).digest("base64url")}`;
}
export function invitationIdFromToken(token: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i.test(
    token,
  )
    ? token.split(".")[0]!
    : null;
}
export function verifyBookingInvitation(
  token: string,
  id: string,
  secret: string,
) {
  const expected = Buffer.from(signBookingInvitation(id, secret));
  const supplied = Buffer.from(token);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}
