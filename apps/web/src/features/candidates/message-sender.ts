export function messageSenderLabel(message: {
  direction: "inbound" | "outbound";
  fromEmail: string | null;
  authorName: string | null;
  origin?: "member" | "system" | "automation" | null;
}) {
  if (message.direction === "inbound") return message.fromEmail || "Candidate";
  if (message.origin === "automation")
    return message.authorName
      ? `Automation · ${message.authorName}'s workflow`
      : "Automation";
  if (message.origin === "system")
    return message.authorName
      ? `System email · triggered by ${message.authorName}`
      : "System email";
  if (message.authorName) return `Sent by ${message.authorName}`;
  if (message.origin === "member") return "Workspace member · name unavailable";
  return "Sender not recorded";
}
