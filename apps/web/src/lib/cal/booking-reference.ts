import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const referenceSchema = z.object({
  applicationId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  expires: z.number().int(),
});

export function signCalBookingReference(
  applicationId: string,
  subscriptionId: string,
  secret: string,
  now = Date.now(),
) {
  const data = Buffer.from(
    JSON.stringify({
      applicationId,
      subscriptionId,
      expires: now + 90 * 86400000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`harly-cal-booking:${data}`)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyCalBookingReference(
  value: unknown,
  subscriptionId: string,
  secret: string,
  now = Date.now(),
) {
  if (typeof value !== "string" || value.length > 1500) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts as [string, string];
  const expected = createHmac("sha256", secret)
    .update(`harly-cal-booking:${data}`)
    .digest("base64url");
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  )
    return null;
  try {
    const parsed = referenceSchema.parse(
      JSON.parse(Buffer.from(data, "base64url").toString()),
    );
    return parsed.subscriptionId === subscriptionId && parsed.expires > now
      ? parsed.applicationId
      : null;
  } catch {
    return null;
  }
}
