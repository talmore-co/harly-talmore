import type { InboxMessage, InboxThread } from "./data";

export function preferredThread(threads: InboxThread[], rememberedId?: string) {
  return threads.find((thread) => thread.id === rememberedId) ?? [...threads].sort((a, b) =>
    Number(b.unreadCount > 0 && b.hasInboundReply === true) - Number(a.unreadCount > 0 && a.hasInboundReply === true) ||
    Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
  )[0];
}

export function initiallyExpanded(message: InboxMessage, latestId?: string) {
  return message.id === latestId || (message.direction === "inbound" && !message.read);
}

/** Keep all text accessible. Only hide recognizable quoted history/signatures. */
export function splitQuotedText(body: string) {
  const lines = body.split("\n");
  const index = lines.findIndex((line, i) => i > 0 && (
    /^On .+wrote:\s*$/.test(line) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim()) ||
    /^>/.test(line) || line === "-- "
  ));
  return index < 0 ? { body, quoted: "" } : { body: lines.slice(0, index).join("\n").trimEnd(), quoted: lines.slice(index).join("\n") };
}
