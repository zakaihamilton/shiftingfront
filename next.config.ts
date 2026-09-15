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
    ];
  },
};

export default nextConfig;
