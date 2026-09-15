import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_THEME_COLOR } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    lang: "en",
    orientation: "any",
    categories: ["games"],
    screenshots: [
      {
        src: "/art/menu-command-vista.webp",
        sizes: "1672x941",
        type: "image/webp",
        form_factor: "wide",
        label: "Command Desk and Campaign Briefing",
      },
    ],
    shortcuts: [
      {
        name: "Training Range",
        short_name: "Tutorial",
        description: "Learn tactical combat, base building, and unit command",
        url: "/tutorial",
        icons: [{ src: "/icons/pwa-192.png", sizes: "192x192" }],
      },
      {
        name: "Saved Missions",
        short_name: "Load Game",
        description: "Resume saved operations and campaigns",
        url: "/load",
        icons: [{ src: "/icons/pwa-192.png", sizes: "192x192" }],
      },
    ],
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
