"use client";

export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      className="text-xs transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
      onClick={() =>
        window.dispatchEvent(new Event("harly:open-cookie-preferences"))
      }
    >
      Cookie preferences
    </button>
  );
}
