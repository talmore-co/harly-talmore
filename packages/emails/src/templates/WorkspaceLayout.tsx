import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { workspaceEmailTheme } from "./theme";
import { HarlyFonts } from "./HarlyFonts";
import { EmailLogo } from "./EmailLogo";
import type { SocialLink } from "./HarlyLayout";

type WorkspaceLayoutProps = {
  preview: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  /** Retained for compatibility; workspace emails never show vendor credits. */
  hideBranding?: boolean;
  children: React.ReactNode;
};

/**
 * Layout for candidate-facing emails sent on behalf of a hiring company
 * (applications, interviews, offers, stage updates, rejections, withdrawals).
 * Structure mirrors the Resend "Matte" demo: a card lifted on the paper
 * canvas by a diffuse evergreen-tinted shadow, with an inner bordered
 * surface. Header shows the company logo (email-optimized PNG from
 * /api/logo/convert) or a typographic lockup with the company name. Footer
 * identifies the sender company without vendor credits.
 */
export function WorkspaceLayout({
  preview,
  companyName,
  companyLogoUrl,
  // The workspace accent colors CTAs; the surrounding card stays neutral.
  accentColor,
  socialLinks: _socialLinks,
  hideBranding: _hideBranding,
  children,
}: WorkspaceLayoutProps) {
  return (
    <Tailwind config={workspaceEmailTheme(accentColor)}>
      <Html lang="en">
        <Head>
          <HarlyFonts />
        </Head>
        <Preview>{preview}</Preview>
        <Body className="bg-canvas font-inter text-[14px] leading-[1.5] text-fg m-0 p-0">
          <Container className="mx-auto max-w-card px-4 pt-16 pb-6">
            <Section className="shadow-harly-card rounded-[8px]">
              <Section className="border-stroke rounded-[8px] border bg-bg">
                {/* Header — the Matte reference keeps the mark airy and unadorned. */}
                <Section className="mobile:px-6! px-10 pt-16">
                  <EmailLogo
                    logoUrl={companyLogoUrl}
                    name={companyName}
                    variant="workspace"
                  />
                </Section>

                {/* Body */}
                <Section className="mobile:px-6! px-10 pt-8 pb-14 text-left">
                  {children}
                </Section>

                {/* Footer */}
                <Section className="border-stroke border-t px-10 py-8">
                  <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0">
                    Sent by {companyName}
                  </Text>
                </Section>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
