"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWorkspaceMetaPixel } from "./meta-actions";
export function MetaPixelPanel({ initialPixelId }: { initialPixelId: string }) {
  const [pixelId, setPixelId] = useState(initialPixelId);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="font-semibold">Meta advertising</h2>
      <p className="text-sm text-muted-foreground">
        Track public job views, application starts, saved applications and
        qualified applications after visitors allow marketing cookies. Set each
        job&apos;s qualification threshold in its questionnaire.
      </p>
      <label className="block space-y-2 text-sm">
        Pixel / Dataset ID
        <Input
          value={pixelId}
          onChange={(event) => setPixelId(event.target.value)}
          placeholder="Numeric Pixel ID from Meta Events Manager"
          inputMode="numeric"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        No questionnaire answers, raw scores, names or email addresses are
        included in our event parameters. Leave blank to disconnect. Configure a
        custom conversion for QualifiedApplication in Meta.
      </p>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage("");
            try {
              await saveWorkspaceMetaPixel(pixelId);
              setMessage("Meta settings saved.");
            } catch {
              setMessage(
                "Could not save. Enter a valid numeric Pixel ID and try again.",
              );
            }
          })
        }
      >
        Save Meta settings
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
