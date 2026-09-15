"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { getInterviewRecordings } from "@/features/account/fathom-actions";
import { toast } from "@/lib/notification-island/toast";

export function InterviewRecordings({ interviewId }: { interviewId: string }) {
  const [recordings, setRecordings] = useState<Awaited<
    ReturnType<typeof getInterviewRecordings>
  > | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-4 border-t pt-4">
      {!recordings ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                setRecordings(await getInterviewRecordings(interviewId));
              } catch {
                toast.error("Could not load interview recordings.");
              }
            })
          }
        >
          {pending ? "Loading…" : "View Fathom recording and notes"}
        </Button>
      ) : recordings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recordings available.
        </p>
      ) : (
        recordings.map((recording) => (
          <section key={recording.id} className="space-y-3">
            <Button asChild size="sm" variant="outline">
              <a
                href={recording.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View recording in Fathom
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Imported from Fathom. Recording access is managed in Fathom.
            </p>
            {recording.summary && (
              <div className="max-w-none space-y-3 break-words text-sm leading-relaxed [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1">
                <h4>Fathom summary</h4>
                <ReactMarkdown
                  skipHtml
                  components={{
                    img: () => null,
                    a: ({ children }) => <span>{children}</span>,
                  }}
                >
                  {recording.summary}
                </ReactMarkdown>
              </div>
            )}
            {recording.transcript?.length ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  View transcript
                </summary>
                <div className="mt-3 max-h-96 space-y-3 overflow-y-auto rounded-lg border p-3">
                  {recording.transcript.map((line, index) => (
                    <div key={index} className="text-sm">
                      <p className="text-xs text-muted-foreground">
                        {line.timestamp} · {line.speaker}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}
