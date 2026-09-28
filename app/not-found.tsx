import type { Metadata } from "next";
import { ConsoleNotice, ConsoleNoticeLink } from "@/components/ui/ConsoleNotice";
import { EscapeToHome } from "@/components/ui/EscapeToHome";

export const metadata: Metadata = {
  title: {
    absolute: "Shifting Front",
  },
};

export default function NotFound() {
  return (
    <>
      <EscapeToHome />
      <ConsoleNotice
      eyebrow="This frequency is dark"
      title="Signal not found"
      detail="That route is not on the command net."
      testId="not-found"
    >
      <ConsoleNoticeLink href="/" muted testId="home-link">
        Return to menu
      </ConsoleNoticeLink>
      </ConsoleNotice>
    </>
  );
}
