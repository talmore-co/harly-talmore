import Link from "next/link";
import { cn } from "@/lib/utils";
export function DirectoryNavigation({
  active,
}: {
  active: "all" | "pool" | "trash";
}) {
  const tabs = [
    { key: "all", label: "All candidates", href: "/dashboard/candidates" },
    { key: "pool", label: "Talent pool", href: "/dashboard/talent-pool" },
    { key: "trash", label: "Trash", href: "/dashboard/candidates?view=trash" },
  ] as const;
  return (
    <nav
      aria-label="Candidate views"
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 font-medium",
            active === tab.key
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
