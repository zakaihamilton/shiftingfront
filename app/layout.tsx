import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { AudioRoot } from "@/components/audio/AudioRoot";
import { TooltipLayer } from "@/components/TooltipLayer";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { APP_DESCRIPTION, APP_NAME, APP_THEME_COLOR, SITE_URL } from "@/lib/site";
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
      : SITE_URL,
);

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: APP_NAME,
    template: `%s — ${APP_NAME}`,
  },
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
    url: SITE_URL,
    type: "website",
    images: [
      {
        url: "/art/menu-command-vista.webp",
        width: 1672,
        height: 941,
        type: "image/webp",
        alt: `${APP_NAME} — Command Desk and Campaign Vista`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/art/menu-command-vista.webp"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: APP_NAME,
  description: APP_DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "Game",
  genre: ["Real-time Strategy", "RTS", "Isometric", "Sci-Fi Strategy"],
  playMode: "SinglePlayer",
  gamePlatform: ["Web Browser"],
  operatingSystem: "Any",
  inLanguage: "en",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  image: `${SITE_URL}/art/menu-command-vista.webp`,
  screenshot: `${SITE_URL}/art/menu-command-vista.webp`,
  author: {
    "@type": "Person",
    name: "Zakai Hamilton",
    url: "https://github.com/zakaihamilton",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ServiceWorkerRegister />
        <AudioRoot />
        <ErrorBoundary>{children}</ErrorBoundary>
        <TooltipLayer />
      </body>
    </html>
  );
}
