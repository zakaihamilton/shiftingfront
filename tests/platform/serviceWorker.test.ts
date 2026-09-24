import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { serviceWorkerScriptUrl } from "@/lib/pwa/serviceWorkerUrl";

const APP_ORIGIN = "https://www.shiftingfront.com";
const SERVICE_WORKER_SOURCE = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf-8");

function cacheKey(input: Request | string): string {
  const url = typeof input === "string" ? new URL(input, APP_ORIGIN) : new URL(input.url);
  url.hash = "";
  return url.href;
}

class MemoryCache {
  private readonly entries = new Map<string, Response>();

  async match(input: Request | string, options?: { ignoreSearch?: boolean }): Promise<Response | undefined> {
    const key = cacheKey(input);
    let response = this.entries.get(key);
    if (!response && options?.ignoreSearch) {
      const target = new URL(key);
      target.search = "";
      response = [...this.entries.entries()].find(([entryKey]) => {
        const candidate = new URL(entryKey);
        candidate.search = "";
        return candidate.href === target.href;
      })?.[1];
    }
    return response?.clone();
  }

  async put(input: Request | string, response: Response): Promise<void> {
    this.entries.set(cacheKey(input), response.clone());
  }
}

type ServiceWorkerEvent = {
  request?: Request;
  respondWith?: (response: Promise<Response> | Response) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
};

function createServiceWorker(deploymentId: string, fetchImpl: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, (event: ServiceWorkerEvent) => void>();
  const storedCaches = new Map<string, MemoryCache>();
  const caches = {
    open: async (name: string) => {
      let cache = storedCaches.get(name);
      if (!cache) {
        cache = new MemoryCache();
        storedCaches.set(name, cache);
      }
      return cache;
    },
    keys: async () => [...storedCaches.keys()],
    delete: async (name: string) => storedCaches.delete(name),
  };
  const self = {
    location: new URL(`${APP_ORIGIN}/sw.js?dpl=${deploymentId}`),
    addEventListener: (type: string, listener: (event: ServiceWorkerEvent) => void) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };

  runInNewContext(SERVICE_WORKER_SOURCE, { self, caches, fetch: fetchImpl, URL, Request, Response });

  return {
    caches,
    async activate() {
      let lifetime: Promise<unknown> = Promise.resolve();
      listeners.get("activate")?.({ waitUntil: (promise: Promise<unknown>) => { lifetime = promise; } });
      await lifetime;
    },
    async fetch(request: Request): Promise<Response> {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")?.({ request, respondWith: (promise: Promise<Response> | Response) => { response = Promise.resolve(promise); } });
      if (!response) throw new Error("The service worker did not handle the request.");
      return response;
    },
  };
}

describe("Service Worker", () => {
  it("ships a valid sw.js file in public/", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    expect(existsSync(swPath)).toBe(true);

    const content = readFileSync(swPath, "utf-8");
    expect(content).toContain("CACHE_NAME");
    expect(content).toContain("CORE_PRECACHE");
    expect(content).toContain("PRECACHE_URLS");
    expect(content).toContain("addEventListener(\"install\"");
    expect(content).toContain("addEventListener(\"activate\"");
    expect(content).toContain("addEventListener(\"fetch\"");
  });

  it("precaches existing static assets", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");

    const match = content.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();

    const urls = match![1]
      .split("\n")
      .map((line) => line.trim().replace(/^["']|["'],?$/g, ""))
      .filter((line) => line.length > 0 && !line.startsWith("//"));

    expect(urls).toContain("/");
    expect(urls).toContain("/manifest.webmanifest");
    expect(urls).toContain("/tutorial");
    expect(urls).toContain("/briefing");
    expect(urls).toContain("/campaign");
    expect(urls).toContain("/play");
    expect(urls).toContain("/campaign-complete");
    expect(urls).toContain("/load");
    expect(urls).toContain("/icons/pwa-192.png");
    expect(urls).toContain("/icons/pwa-512.png");

    for (const url of urls) {
      if (url === "/" || url === "/manifest.webmanifest") continue;
      const relative = url.replace(/^\//, "");
      const publicPath = resolve(process.cwd(), "public", relative);
      const appPath = resolve(process.cwd(), "app", relative);
      const exists = existsSync(publicPath) || existsSync(appPath);
      expect(exists, `Precache asset should exist on disk: ${url}`).toBe(true);
    }
  });

  it("precaches all visual art assets under public/art", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");
    const match = content.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();

    const urls = new Set(
      match![1]
        .split("\n")
        .map((line) => line.trim().replace(/^["']|["'],?$/g, ""))
        .filter((line) => line.length > 0 && !line.startsWith("//")),
    );

    function collectFiles(dir: string, baseDir: string): string[] {
      let results: string[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(collectFiles(full, baseDir));
        } else {
          results.push("/" + relative(baseDir, full).replace(/\\/g, "/"));
        }
      }
      return results;
    }

    const artFiles = collectFiles(resolve(process.cwd(), "public/art"), resolve(process.cwd(), "public"));
    expect(artFiles.length).toBeGreaterThanOrEqual(100);

    for (const artFile of artFiles) {
      expect(urls.has(artFile), `Missing art file in PRECACHE_URLS: ${artFile}`).toBe(true);
    }
  });

  it("supports offline navigation with query parameters and dynamic subresource discovery", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");

    // Must use ignoreSearch to allow offline navigation to ?seed=...&mission=...
    expect(content).toContain("ignoreSearch: true");

    // Must dynamically discover and cache Next.js static bundles from HTML pages
    expect(content).toContain("_next/static/");
    expect(content).toContain("matchAll");
  });

  it("fails install when a core route or icon cannot be precached", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");
    const install = content.slice(content.indexOf('addEventListener("install"'));

    expect(content).toContain("CORE_PRECACHE");
    expect(install).toContain("required: true");
    expect(install).not.toContain(".catch(() => self.skipWaiting())");
  });

  it("bypasses stale caching during localhost development", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");

    expect(content).toContain('const CACHE_NAME = "shiftingfront-v5"');
    expect(content).toContain("CORE_PRECACHE");
    expect(content).toContain("required: true");
    expect(content).toContain('url.hostname === "localhost"');
    expect(content).toContain('url.hostname === "127.0.0.1"');
  });

  it("registers a service worker with the deployment ID from its Next.js assets", () => {
    const assets = [
      `${APP_ORIGIN}/_next/static/chunks/webpack-runtime.js?dpl=dpl_current`,
      "https://third-party.example/_next/static/chunks/other.js?dpl=dpl_other",
      `${APP_ORIGIN}/art/portrait.webp?dpl=dpl_asset`,
    ];

    expect(serviceWorkerScriptUrl(assets, APP_ORIGIN)).toBe("/sw.js?dpl=dpl_current");
    expect(serviceWorkerScriptUrl([], APP_ORIGIN)).toBe("/sw.js");
  });

  it("isolates caches by deployment and removes prior Shifting Front caches on activation", async () => {
    const worker = createServiceWorker("dpl_current", async () => new Response("network"));
    await worker.caches.open("shiftingfront-dpl_previous");
    await worker.caches.open("shiftingfront-v5");
    await worker.caches.open("another-app-cache");

    await worker.activate();

    expect(await worker.caches.keys()).toEqual(["another-app-cache"]);
    const currentCache = await worker.caches.open("shiftingfront-dpl_current");
    expect(currentCache).toBeDefined();
  });

  it("fetches route data before consulting cached data and updates the current deployment cache", async () => {
    const routeData = new Request(`${APP_ORIGIN}/briefing?seed=0759&mission=0&_rsc=route-key`);
    let networkCalls = 0;
    const worker = createServiceWorker("dpl_current", async () => {
      networkCalls += 1;
      return new Response("fresh route data");
    });
    const currentCache = await worker.caches.open("shiftingfront-dpl_current");
    await currentCache.put(routeData, new Response("stale route data"));

    const response = await worker.fetch(routeData);

    expect(networkCalls).toBe(1);
    expect(await response.text()).toBe("fresh route data");
    expect(await (await currentCache.match(routeData))?.text()).toBe("fresh route data");
  });

  it("does not fall back to route data cached by a previous deployment", async () => {
    const routeData = new Request(`${APP_ORIGIN}/briefing?seed=0759&mission=0&_rsc=route-key`);
    const worker = createServiceWorker("dpl_current", async () => {
      throw new Error("offline");
    });
    const previousCache = await worker.caches.open("shiftingfront-dpl_previous");
    await previousCache.put(routeData, new Response("stale route data"));

    await worker.activate();
    await expect(worker.fetch(routeData)).rejects.toThrow("Offline and no cached response is available.");
    expect(await worker.caches.keys()).not.toContain("shiftingfront-dpl_previous");
  });
});
