"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/lib/notification-island/toast";
import { saveRoleTakenOn } from "./taken-on-actions";

export function RoleTakenOn({
  jobId,
  takenOn,
  today,
  canEdit,
}: {
  jobId: string;
  takenOn: string | null;
  today: string;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(takenOn ?? ""),
    [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor="role-taken-on" className="text-sm font-medium">
        Role taken on · internal
      </label>
      <DatePicker
        id="role-taken-on"
        value={value}
        max={today}
        disabled={pending || !canEdit}
        className="w-full min-w-0"
        onChange={setValue}
      />
      <p className="text-xs text-muted-foreground">
        Date the client approved Talmore to start recruiting. Used for
        first-submission speed.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canEdit || pending || value === (takenOn ?? "")}
        onClick={() =>
          startTransition(async () => {
            const result = await saveRoleTakenOn(jobId, value || null);
            if (!result.success) return void toast.error(result.error);
            toast.success(
              value ? "Approval date saved" : "Approval date cleared",
            );
            router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Save date"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Leave blank if unknown. Never shown publicly.
      </p>
    </div>
  );
}
