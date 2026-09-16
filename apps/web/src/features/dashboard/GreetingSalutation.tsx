"use client";
import { useEffect, useState } from "react";
import { greetingForTimeZone, isValidTimeZone } from "@/lib/timezone";

export function GreetingSalutation({
  timeZone,
  initialNow,
}: {
  timeZone: string | null;
  initialNow: string;
}) {
  const [greeting, setGreeting] = useState(() =>
    timeZone ? greetingForTimeZone(new Date(initialNow), timeZone) : "Hello",
  );
  useEffect(() => {
    const zone =
      timeZone && isValidTimeZone(timeZone)
        ? timeZone
        : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const update = () => setGreeting(greetingForTimeZone(new Date(), zone));
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [timeZone]);
  return greeting;
}
