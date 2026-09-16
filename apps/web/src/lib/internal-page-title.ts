const sections: Record<string, string> = {
  pipeline: "Pipeline",
  candidates: "Candidates",
  jobs: "Jobs",
  inbox: "Inbox",
  calendars: "Calendar",
  tasks: "Tasks",
  reports: "Reports",
  "career-page": "Career page",
  "talent-pool": "Talent pool",
  documents: "Documents",
  templates: "Templates",
  people: "Team",
  account: "Account",
  settings: "Settings",
};
const settings: Record<string, string> = {
  integrations: "Integrations",
  company: "Company & brand",
  general: "General",
  members: "Members & roles",
  people: "Members & roles",
  roles: "Roles",
  security: "Security",
  ai: "AI",
  email: "Email",
  developers: "Developers & API",
  legal: "Legal & compliance",
  portal: "Candidate portal",
  billing: "Billing",
  signature: "Signature",
};
export function internalPageTitle(pathname: string | null) {
  const parts = (pathname ?? "").split("/").filter(Boolean);
  if (parts[0] === "dashboard") {
    const section = parts[1];
    if (!section) return "Home";
    if (section === "jobs" && parts[2])
      return parts[2] === "new" ? "Create job" : "Job details";
    if (section === "candidates" && parts[2]) return "Candidate profile";
    return sections[section] ?? "Dashboard";
  }
  if (parts[0] === "settings") return settings[parts[1] ?? ""] ?? "Settings";
  if (parts[0] === "account") return "Account";
  if (parts[0] === "people") return "Team";
  return null;
}
