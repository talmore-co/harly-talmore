"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickCreateButton } from "./QuickCreateMenu";
import { WorkspaceMark } from "./WorkspaceSwitcher";
import {
  accountNav,
  hasNavPermission,
  isNavActive,
  settingsNav,
  visibleNavigation,
  type NavItem,
} from "./nav-items";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SidebarBranding } from "@/features/workspaces/data";
import type { Permission } from "@/features/workspaces/permissions";

type NavigationProps = {
  workspace: { id: string; name: string; logoUrl: string | null };
  inboxCount: number;
  taskDueCount: number;
  userPermissions: Permission[];
};

export function IconRail({
  workspace,
  inboxCount,
  taskDueCount,
  userPermissions,
  sidebarLogo,
  userId,
  initialCollapsed,
}: NavigationProps & {
  sidebarLogo: SidebarBranding;
  userId: string;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `harly_sidebar_${encodeURIComponent(userId)}=${next ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };
  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "hidden h-full shrink-0 flex-col bg-warm-paper py-3 md:flex",
        collapsed ? "w-[60px] px-2" : "w-56 px-3",
      )}
    >
      <div
        className={cn(
          "mb-3 flex shrink-0 items-center gap-2",
          collapsed && "flex-col",
        )}
      >
        <Link
          href="/dashboard"
          aria-label={`${workspace.name}, go to home`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <WorkspaceMark
            name={workspace.name}
            logoUrl={
              sidebarLogo.style === "bordered"
                ? (sidebarLogo.lightUrl ?? workspace.logoUrl)
                : workspace.logoUrl
            }
            className="size-9 shrink-0 rounded-[11px]"
            priority
          />
          {!collapsed ? (
            <span className="truncate text-sm font-semibold">
              {workspace.name}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-soft-ink hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>
      <div className="mb-3 shrink-0">
        <QuickCreateButton expanded={!collapsed} />
      </div>
      <NavigationLinks
        collapsed={collapsed}
        inboxCount={inboxCount}
        taskDueCount={taskDueCount}
        userPermissions={userPermissions}
      />
      <FooterLinks collapsed={collapsed} userPermissions={userPermissions} />
    </aside>
  );
}

function NavigationLinks({
  collapsed = false,
  inboxCount,
  taskDueCount,
  userPermissions,
  onNavigate,
}: Omit<NavigationProps, "workspace"> & {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Main"
      className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden py-1"
    >
      {visibleNavigation(userPermissions).map((group, index) => (
        <div
          key={group.label ?? index}
          className={cn(
            "space-y-1",
            index > 0 && !group.label && "border-t border-hairline pt-3",
          )}
        >
          {group.label ? (
            collapsed ? (
              <div
                role="separator"
                className="mx-2 my-2 border-t border-hairline"
              />
            ) : (
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-soft-ink">
                {group.label}
              </p>
            )
          ) : null}
          {group.items.map((item) => (
            <NavigationLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              count={
                item.badge === "inbox"
                  ? inboxCount
                  : item.badge === "tasks"
                    ? taskDueCount
                    : 0
              }
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function FooterLinks({
  collapsed = false,
  userPermissions,
  onNavigate,
}: {
  collapsed?: boolean;
  userPermissions: Permission[];
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label="Settings and account"
      className="mt-2 shrink-0 space-y-1 border-t border-hairline pt-2"
    >
      {hasNavPermission(settingsNav, userPermissions) ? (
        <NavigationLink
          item={settingsNav}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ) : null}
      <NavigationLink
        item={accountNav}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function NavigationLink({
  item,
  collapsed,
  count = 0,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, item);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={count > 0 ? `${item.label} (${count})` : item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-10 items-center rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "justify-center" : "gap-3 px-3",
        active
          ? "bg-row-wash font-medium text-near-ink"
          : "text-soft-ink hover:bg-row-wash/70 hover:text-near-ink",
      )}
    >
      <Icon className="size-[19px] shrink-0" strokeWidth={1.8} />
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      ) : null}
      {count > 0 ? (
        <span
          aria-hidden
          className={cn(
            "rounded-full bg-chartreuse-signal px-1.5 text-[10px] leading-4 text-chartreuse-ink",
            collapsed && "absolute right-0 top-0",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

export function MobileNav({
  open,
  onOpenChange,
  workspace,
  ...props
}: NavigationProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[280px] max-w-[85vw] flex-col gap-0 p-3"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="mb-4 flex shrink-0 items-center gap-2 py-2 pr-8">
          <WorkspaceMark
            name={workspace.name}
            logoUrl={workspace.logoUrl}
            className="size-8 rounded-lg"
          />
          <span className="truncate font-medium">{workspace.name}</span>
        </div>
        <NavigationLinks {...props} onNavigate={close} />
        <FooterLinks
          userPermissions={props.userPermissions}
          onNavigate={close}
        />
      </SheetContent>
    </Sheet>
  );
}
