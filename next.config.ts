import type { NextConfig } from "next";
import { simulationBuildIdentity } from "./lib/multiplayer/buildIdentity";

const isDev = process.env.NODE_ENV !== "production";
function peerovoConnectSources() {
  const sources = new Set<string>();
  const configured = [process.env.PEEROVO_API_URL, process.env.PEEROVO_SIGNALING_ORIGIN];
  for (const value of configured) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      sources.add(url.origin);
      sources.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
    } catch {
      // Invalid optional Peerovo CSP origins are ignored; the server route
      // validates API configuration before issuing any credentials.
    }
  }
  return [...sources].join(" ");
}
const peerovoSources = peerovoConnectSources();
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com${peerovoSources ? ` ${peerovoSources}` : ""}`,
  "worker-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://*.itch.io https://itch.io https://*.newgrounds.com https://*.crazygames.com",
].join("; ");

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SIMULATION_BUILD_ID: simulationBuildIdentity(process.cwd()) },
  experimental: {
    // Next uses the TypeScript 6 API alias; `yarn typecheck` runs the TypeScript 7 CLI.
    useTypeScriptCli: false,
  },
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "fullscreen=*, autoplay=*, clipboard-write=*, screen-wake-lock=*",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
      {
        source: "/(art|icons)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
