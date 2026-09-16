import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import { internalPageTitle } from "@/lib/internal-page-title";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookiePanel } from "@/components/CookieConsentBanner";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

import "./globals.css";

// One self-hosted variable font covers both body and chrome weights.
const onest = localFont({
  src: "./fonts/onest/onest-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-onest",
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

const mono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = internalPageTitle((await headers()).get("x-talmore-pathname"));
  return {
    metadataBase: new URL(getHarlyPublicOrigin()),
    title: page ? { default: `Talmore ATS | ${page}`, template: "Talmore ATS | %s" } : "Talmore ATS",
    description: "Talmore applicant tracking system.",
    icons: {
      icon: "/favicon.svg",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let hasConsent = false;
  try {
    const saved = JSON.parse(
      decodeURIComponent(
        (await cookies()).get("harly_cookie_consent")?.value ?? "null",
      ),
    );
    hasConsent =
      saved?.necessary === true && typeof saved?.marketing === "boolean";
  } catch {
    /* Invalid consent is treated as a new visit. */
  }
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${onest.variable} ${mono.variable} h-full antialiased`}
      style={{ "--font-onest-var": "var(--font-onest)" } as React.CSSProperties}
      data-scroll-behavior="smooth"
    >
      <head>
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://www.gravatar.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        <link rel="dns-prefetch" href="https://www.gravatar.com" />
      </head>
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors closeButton />
          <CookiePanel initialVisible={!hasConsent} />
        </ThemeProvider>
      </body>
    </html>
  );
}
