"use client";

import { Component, type ReactNode } from "react";
import { ConsoleButton } from "./ConsoleButton";
import { ConsoleNotice, ConsoleNoticeLink } from "./ConsoleNotice";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Screen-specific heading shown when content crashes. */
  title?: string;
  eyebrow?: string;
  fallback?: ReactNode;
};
type ErrorBoundaryState = { hasError: boolean; error: Error | null; copied: boolean };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, copied: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ConsoleNotice
          eyebrow={this.props.eyebrow ?? "Transmission interrupted"}
          title={this.props.title ?? "Something went wrong"}
          detail={this.state.error?.message || "An unexpected error occurred."}
          testId="screen-error"
        >
          <ConsoleButton onClick={() => this.setState({ hasError: false, error: null, copied: false })}>
            Try again
          </ConsoleButton>
          <ConsoleButton
            muted
            onClick={() => {
              const diagnostics = JSON.stringify(
                {
                  error: this.state.error?.message,
                  stack: this.state.error?.stack,
                  url: typeof window !== "undefined" ? window.location.href : "",
                  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              );
              void navigator.clipboard?.writeText(diagnostics);
              this.setState({ copied: true });
              setTimeout(() => this.setState({ copied: false }), 2500);
            }}
          >
            {this.state.copied ? "Copied!" : "Copy Diagnostics"}
          </ConsoleButton>
          <ConsoleNoticeLink href="/" muted testId="home-link">
            Return to menu
          </ConsoleNoticeLink>
        </ConsoleNotice>
      );
    }
    return this.props.children;
  }
}
