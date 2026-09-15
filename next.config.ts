import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
            value: "fullscreen=*, autoplay=*, clipboard-write=*",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.itch.io https://itch.io https://*.newgrounds.com https://*.crazygames.com;",
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
