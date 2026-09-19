"use client";

import Link from "next/link";
import { Briefcase, CalendarPlus, Plus, UserPlus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function Items() {
  return (
    <>
      <DropdownMenuLabel className="type-col-head">Create</DropdownMenuLabel>
      <DropdownMenuItem asChild className="gap-2.5">
        <Link href="/dashboard/jobs/new">
          <Briefcase className="size-4 text-soft-ink" strokeWidth={1.8} />
          New job
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="gap-2.5">
        <Link href="/dashboard/candidates">
          <UserPlus className="size-4 text-soft-ink" strokeWidth={1.8} />
          Add candidate
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="gap-2.5">
        <Link href="/dashboard/calendars">
          <CalendarPlus className="size-4 text-soft-ink" strokeWidth={1.8} />
          Schedule interview
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/** Shared create action for the expanded and collapsed sidebar. */
export function QuickCreateButton({ expanded = false }: { expanded?: boolean }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label="Create"
            className={`flex h-10 items-center gap-3 rounded-[12px] border border-mist-border bg-pure-snow text-near-ink transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink ${expanded ? "w-full px-3" : "w-10 justify-center"}`}
          >
            <Plus className="size-[18px]" strokeWidth={2} />
            {expanded ? <span className="text-sm font-medium">Create</span> : null}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Create</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="start" className="min-w-52">
        <Items />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
