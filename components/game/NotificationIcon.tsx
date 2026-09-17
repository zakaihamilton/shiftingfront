import type { SVGProps } from "react";

export type NotificationIconKind = "success" | "info" | "warning" | "error" | "objective" | "contact" | "system";

export function NotificationIcon({ kind, className }: { kind: NotificationIconKind; className?: string }) {
  const props: SVGProps<SVGSVGElement> = {
    className,
    viewBox: "0 0 16 16",
    "aria-hidden": true,
    focusable: false,
  };

  if (kind === "success") {
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="6" />
        <path d="m5 8 2 2 4-4" />
      </svg>
    );
  }

  if (kind === "error") {
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="6" />
        <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" />
      </svg>
    );
  }

  if (kind === "warning") {
    return (
      <svg {...props}>
        <path d="M8 2 14 13H2L8 2Z" />
        <path d="M8 5.5v3.2M8 11.2v.1" />
      </svg>
    );
  }

  if (kind === "objective") {
    return (
      <svg {...props}>
        <path d="m8 2 6 6-6 6-6-6 6-6Z" />
        <circle cx="8" cy="8" r="1" />
      </svg>
    );
  }

  if (kind === "contact") {
    return (
      <svg {...props}>
        <path d="M2 8c1.2-2.5 2.3-2.5 3.5 0s2.3 2.5 3.5 0 2.3-2.5 3.5 0 2.3 2.5 3.5 0" />
      </svg>
    );
  }

  if (kind === "system") {
    return (
      <svg {...props}>
        <rect x="3" y="3" width="10" height="10" />
        <path d="M6 6h4v4H6z" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v3.5M8 5.2v.1" />
    </svg>
  );
}
