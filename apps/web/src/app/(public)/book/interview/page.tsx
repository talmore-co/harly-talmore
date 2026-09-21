import type { Metadata } from "next";
import { InterviewBookingPage } from "@/features/interviews/InterviewBookingPage";

export const metadata: Metadata = {
  title: "Choose an interview time | Talmore",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page() {
  return <InterviewBookingPage />;
}
