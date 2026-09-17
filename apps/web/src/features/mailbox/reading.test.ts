import { describe, expect, it } from "vitest";
import type { InboxMessage, InboxThread } from "./data";
import { initiallyExpanded, preferredThread, splitQuotedText } from "./reading";
import { matchesInboxFilter } from "./inbox-filters";

describe("people-first email reading", () => {
  const threads = [
    { id: "receipt", status: "open", unreadCount: 0, hasInboundReply: false, needsReply: false, lastMessageAt: "2026-09-17T10:00:00Z" },
    { id: "reply", status: "open", unreadCount: 1, hasInboundReply: true, needsReply: true, lastMessageAt: "2026-09-17T09:00:00Z" },
  ] as InboxThread[];
  it("opens an unread incoming thread ahead of a newer receipt, then remembers the chosen thread", () => {
    expect(preferredThread(threads)?.id).toBe("reply");
    expect(preferredThread(threads, "receipt")?.id).toBe("receipt");
    expect(preferredThread(threads, "removed")?.id).toBe("reply");
    expect(preferredThread([])).toBeUndefined();
  });
  it("expands the latest message even when it arrives after the reader mounts", () => {
    const message = { id: "loaded-later", direction: "outbound", read: true } as InboxMessage;
    expect(initiallyExpanded(message, "loaded-later")).toBe(true);
    expect(initiallyExpanded(message, "newer")).toBe(false);
    expect(initiallyExpanded({ ...message, direction: "inbound", read: false }, "newer")).toBe(true);
  });
  it("retains quoted content without hiding ordinary message text", () => {
    expect(splitQuotedText("Available Thursday.\n\nOn Monday, Alex wrote:\n> What time?")).toEqual({ body: "Available Thursday.", quoted: "On Monday, Alex wrote:\n> What time?" });
    expect(splitQuotedText("On Thursday I am available.\nThanks!")).toEqual({ body: "On Thursday I am available.\nThanks!", quoted: "" });
  });
  it("does not classify automated outbound receipts or missing metadata as awaiting reply", () => {
    expect(matchesInboxFilter(threads[0]!, "needs-reply")).toBe(false);
    expect(matchesInboxFilter(threads[1]!, "needs-reply")).toBe(true);
    expect(matchesInboxFilter({ ...threads[0]!, needsReply: undefined }, "needs-reply")).toBe(false);
  });
});
