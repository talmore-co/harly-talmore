/** Multiple choices travel as JSON in the existing string-valued answer contract. */
export function parseMultiSelectAnswer(value: string): string[] | null {
  if (!value.trim()) return [];
  if (value.length > 10_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 20 ||
      parsed.some(
        (item) => typeof item !== "string" || !item.length || item.length > 120,
      )
    )
      return null;
    if (new Set(parsed).size !== parsed.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function validateMultiSelectAnswer(
  value: string,
  options: readonly string[],
  required: boolean,
): string | null {
  const selected = parseMultiSelectAnswer(value);
  if (!selected || selected.some((option) => !options.includes(option)))
    return "Select valid options.";
  if (required && selected.length === 0) return "Select at least one option.";
  return null;
}

/** Persist readable choices for candidate profiles, exports, and AI evaluation. */
export function questionAnswerText(type: string, value: string): string {
  return type === "multiselect"
    ? (parseMultiSelectAnswer(value) ?? []).join("\n")
    : value.trim();
}
