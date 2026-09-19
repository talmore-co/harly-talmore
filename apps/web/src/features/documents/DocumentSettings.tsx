"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CategoryDialog } from "./DocumentShared";
import type { DocumentCategoryItem } from "./shared";
export function DocumentSettings({
  categories,
}: {
  categories: DocumentCategoryItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Document categories</h2>
      <p className="text-sm text-muted-foreground">
        Manage the categories used to organize documents across your workspace.
      </p>
      <Button onClick={() => setOpen(true)}>Manage categories</Button>
      <CategoryDialog
        data={{ categories }}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  );
}
