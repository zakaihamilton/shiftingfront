import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { AudioRoot } from "@/components/audio/AudioRoot";
import { TooltipLayer } from "@/components/TooltipLayer";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { APP_DESCRIPTION, APP_NAME, APP_THEME_COLOR } from "@/lib/site";
import styles from "./layout.module.css";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const metadataBase = new URL(
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000",
);

export const metadata: Metadata = {
  metadataBase,
  title: APP_NAME,
  applicationName: APP_NAME,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    type: "website",
    images: [{ url: "/art/menu-command-vista.webp" }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/art/menu-command-vista.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${barlow.variable} ${ibmPlexMono.variable} ${styles.html}`}
    >
      <body className={styles.body}>
        <ServiceWorkerRegister />
        <AudioRoot />
        <ErrorBoundary>{children}</ErrorBoundary>
        <TooltipLayer />
      </body>
    </html>
  );
}
