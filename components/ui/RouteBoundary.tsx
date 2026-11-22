"use client";

import { type ReactNode, Suspense } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { PageFallback } from "./PageFallback";

export function RouteBoundary({
  loadingText,
  eyebrow,
  title,
  children,
}: {
  loadingText: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<PageFallback>{loadingText}</PageFallback>}>
      <ErrorBoundary eyebrow={eyebrow} title={title}>
        {children}
      </ErrorBoundary>
    </Suspense>
  );
}
