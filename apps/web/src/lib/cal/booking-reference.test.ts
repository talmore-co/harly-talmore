import { describe, expect, it } from "vitest";
import {
  signCalBookingReference,
  verifyCalBookingReference,
} from "./booking-reference";

const application = "11111111-1111-4111-8111-111111111111";
const subscription = "22222222-2222-4222-8222-222222222222";
describe("personal Cal.com booking references", () => {
  it("binds a link to its application and subscription", () => {
    const token = signCalBookingReference(
      application,
      subscription,
      "fictional-secret",
      1000,
    );
    expect(
      verifyCalBookingReference(token, subscription, "fictional-secret", 2000),
    ).toBe(application);
    expect(
      verifyCalBookingReference(token, application, "fictional-secret", 2000),
    ).toBeNull();
    expect(
      verifyCalBookingReference(token, subscription, "another-secret", 2000),
    ).toBeNull();
  });
  it("rejects tampering, malformed values and expired links", () => {
    const token = signCalBookingReference(
      application,
      subscription,
      "fictional-secret",
      1000,
    );
    for (const value of [
      null,
      {},
      "x",
      `${token}.extra`,
      `${token.split(".")[0]}.${"é".repeat(43)}`,
      `x${token}`,
      token.replace(/.$/, "!"),
      "x".repeat(1600),
    ]) {
      expect(
        verifyCalBookingReference(
          value,
          subscription,
          "fictional-secret",
          2000,
        ),
      ).toBeNull();
    }
    expect(
      verifyCalBookingReference(
        token,
        subscription,
        "fictional-secret",
        1000 + 90 * 86400000,
      ),
    ).toBeNull();
  });
});
