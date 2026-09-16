import { describe, expect, it } from "vitest";
import { metaRequestContext } from "./request-context";

describe("Meta consent and attribution", () => {
  const headers = (consent: unknown, extra = "") =>
    new Headers({
      cookie: `harly_cookie_consent=${encodeURIComponent(JSON.stringify(consent))}; ${extra}`,
      "user-agent": "Fictional test browser",
    });
  it("requires explicit marketing consent, not merely a present cookie", () => {
    for (const consent of [
      null,
      {},
      { marketing: false },
      { marketing: "true" },
    ])
      expect(metaRequestContext(headers(consent), "203.0.113.4")).toBeNull();
    expect(
      metaRequestContext(
        new Headers({ cookie: "harly_cookie_consent=bad-json" }),
        "203.0.113.4",
      ),
    ).toBeNull();
  });
  it("extracts only allowlisted bounded matching identifiers", () => {
    const result = metaRequestContext(
      headers(
        { marketing: true },
        "_fbp=fb.1.1700000000000.12345; _fbc=fb.1.1700000000000.click-id; email=private@example.test",
      ),
      "203.0.113.4",
    );
    expect(result).toEqual({
      client_user_agent: "Fictional test browser",
      client_ip_address: "203.0.113.4",
      fbp: "fb.1.1700000000000.12345",
      fbc: "fb.1.1700000000000.click-id",
    });
  });
  it("ignores malformed IPs and attribution cookies", () => {
    expect(
      metaRequestContext(
        headers({ marketing: true }, "_fbp=bad; _fbc=bad"),
        "unknown",
      ),
    ).toEqual({ client_user_agent: "Fictional test browser" });
  });
});
