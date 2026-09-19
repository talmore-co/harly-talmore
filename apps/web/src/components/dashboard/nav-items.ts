import type { Route } from "next";
import {
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  Globe,
  Home,
  Inbox,
  KanbanSquare,
  ListTodo,
  NotebookTabs,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  SETTINGS_SECTION_PERMISSION,
  type Permission,
} from "@/features/workspaces/permissions";

export type NavBadge = "inbox" | "tasks";
export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  exact?: boolean;
  aliases?: string[];
  badge?: NavBadge;
  requiredPermission?: Permission | Permission[];
};
export const navigationGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ label: "Home", href: "/dashboard", icon: Home, exact: true }],
  },
  {
    label: "Work",
    items: [
      { label: "Inbox", href: "/dashboard/inbox", icon: Inbox, badge: "inbox" },
      {
        label: "Tasks",
        href: "/dashboard/tasks",
        icon: ListTodo,
        badge: "tasks",
        requiredPermission: "tasks:read",
      },
      { label: "Calendar", href: "/dashboard/calendars", icon: CalendarDays },
    ],
  },
  {
    label: "Recruiting",
    items: [
      {
        label: "Pipeline",
        href: "/dashboard/pipeline",
        icon: KanbanSquare,
        requiredPermission: "jobs:view",
      },
      {
        label: "Candidates",
        href: "/dashboard/candidates",
        aliases: ["/dashboard/talent-pool"],
        icon: Users,
        requiredPermission: "candidates:view",
      },
      {
        label: "Jobs",
        href: "/dashboard/jobs",
        icon: Briefcase,
        requiredPermission: "jobs:view",
      },
      {
        label: "Clients",
        href: "/dashboard/clients",
        icon: Building2,
        requiredPermission: "clients:view",
      },
    ],
  },
  {
    label: null,
    items: [
      {
        label: "Documents",
        href: "/dashboard/documents" as Route,
        icon: NotebookTabs,
        requiredPermission: "documents:read",
      },
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: BarChart3,
        requiredPermission: "reports:read",
      },
    ],
  },
];

export const settingsNav: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
  aliases: ["/dashboard/career-page", "/dashboard/templates", "/people"],
  requiredPermission: [
    ...new Set(Object.values(SETTINGS_SECTION_PERMISSION).flat()),
  ],
};
export const accountNav: NavItem = {
  label: "Your account",
  href: "/account",
  icon: UserRound,
};

export function isNavActive(pathname: string, item: NavItem) {
  const matches = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  return (
    (item.exact ? pathname === item.href : matches(item.href)) ||
    (item.aliases?.some(matches) ?? false)
  );
}
export function hasNavPermission(item: NavItem, permissions: Permission[]) {
  if (!item.requiredPermission) return true;
  return Array.isArray(item.requiredPermission)
    ? item.requiredPermission.some((permission) =>
        permissions.includes(permission),
      )
    : permissions.includes(item.requiredPermission);
}
export function visibleNavigation(permissions: Permission[]) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasNavPermission(item, permissions)),
    }))
    .filter((group) => group.items.length > 0);
}
/** Includes secondary destinations for command search and section titles. */
export function allNavItems(): NavItem[] {
  return [
    {
      label: "Colleague directory",
      href: "/people" as Route,
      icon: UserRound,
      exact: true,
    },
    {
      label: "Team & access",
      href: "/settings/members" as Route,
      icon: Users,
      requiredPermission: "members:read",
    },
    {
      label: "Talent pool",
      href: "/dashboard/talent-pool",
      icon: Bookmark,
      requiredPermission: "candidates:view",
    },
    {
      label: "Templates",
      href: "/settings/templates" as Route,
      aliases: ["/dashboard/templates"],
      icon: FileText,
      requiredPermission: "templates:manage",
    },
    {
      label: "Career page",
      href: "/settings/career-page" as Route,
      aliases: ["/dashboard/career-page"],
      icon: Globe,
      requiredPermission: "settings:edit",
    },
    ...navigationGroups.flatMap((group) => group.items),
    settingsNav,
    accountNav,
  ];
}
