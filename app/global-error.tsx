"use client";

import { useEffect } from "react";
import Link from "next/link";
import { APP_NAME, APP_THEME_COLOR } from "@/lib/site";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en" style={{ backgroundColor: APP_THEME_COLOR, color: "#e8f2f6" }}>
      <head>
        <title>{`Fatal Error — ${APP_NAME}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={APP_THEME_COLOR} />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: APP_THEME_COLOR,
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            backgroundColor: "#0d1520",
            border: "1px solid #ff4d4d",
            borderRadius: "4px",
            padding: "32px 24px",
            textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
          }}
        >
          <div
            style={{
              color: "#ff4d4d",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "2px",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Fatal Transmission Error
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 900,
              color: "#ffffff",
              margin: "0 0 16px 0",
              letterSpacing: "1px",
            }}
          >
            System Failure
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#9db0be",
              lineHeight: 1.5,
              margin: "0 0 24px 0",
              wordBreak: "break-word",
            }}
          >
            {error.message || "An unrecoverable application error occurred."}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                backgroundColor: "#ff4d4d",
                color: "#05080e",
                border: "none",
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "1px",
                textTransform: "uppercase",
                borderRadius: "2px",
                cursor: "pointer",
              }}
            >
              Reinitialize
            </button>
            <Link
              href="/"
              style={{
                backgroundColor: "transparent",
                color: "#5ce1e6",
                border: "1px solid #5ce1e6",
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "1px",
                textTransform: "uppercase",
                borderRadius: "2px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Return Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
