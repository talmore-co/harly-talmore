/** Plain-text templates. Values are escaped only when the complete text becomes HTML. */
export function renderWorkflowText(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    let value: unknown = context;
    for (const part of path.split(".")) {
      if (["__proto__", "constructor", "prototype"].includes(part) || !value || typeof value !== "object" || !Object.hasOwn(value, part)) throw new Error(`Unknown message variable: ${path}`);
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== "string" && typeof value !== "number") throw new Error(`Message variable is unavailable: ${path}`);
    return String(value);
  });
}
export function workflowTextHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("\n", "<br />");
}
