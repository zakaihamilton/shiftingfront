/** Build a service worker URL tied to the deployment serving this page. */
export function serviceWorkerScriptUrl(assetUrls: Iterable<string>, pageHref: string): string {
  let pageUrl: URL;
  try {
    pageUrl = new URL(pageHref);
  } catch {
    return "/sw.js";
  }

  for (const assetUrl of assetUrls) {
    try {
      const url = new URL(assetUrl, pageUrl);
      if (url.origin !== pageUrl.origin || !url.pathname.startsWith("/_next/static/")) continue;
      const deploymentId = url.searchParams.get("dpl");
      if (deploymentId && /^[a-zA-Z0-9_-]{1,80}$/.test(deploymentId)) {
        return `/sw.js?dpl=${encodeURIComponent(deploymentId)}`;
      }
    } catch {
      // Ignore resource entries that are not valid URLs.
    }
  }

  return "/sw.js";
}
