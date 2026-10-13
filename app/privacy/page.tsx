import type { Metadata } from "next";
import { LegalDocument } from "@/components/ui/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — Shifting Front",
  description: "Privacy policy for Shifting Front RTS, including local game storage and Vercel Web Analytics.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Command Desk // Security Clearance"
      title="Privacy Policy"
      lastUpdated="Effective Date: October 2, 2026"
      otherLinkHref="/terms"
      otherLinkLabel="Terms of Service"
    >
          <h2>1. Overview</h2>
          <p>
            Shifting Front is a deterministic browser real-time strategy game. Campaign and tutorial simulation runs in your browser. Campaign saves, progress, preferences, and diagnostics are stored on your device. Online skirmishes use Peerovo for temporary connection credentials and settings; participating players exchange commands and synchronized match state over PeerJS/WebRTC. The website also uses Vercel Web Analytics to understand aggregated traffic and page views. Vercel Web Analytics does not use cookies and is designed not to identify individual visitors, but it does transmit limited page-view information to Vercel.
          </p>

          <h2>2. Game Data and Website Analytics</h2>
          <p>
            When you use Shifting Front:
          </p>
          <ul>
            <li>No user account or login is required.</li>
            <li>Campaign generation and campaign/tutorial simulations run locally. Online skirmishes use Peerovo to issue short-lived connection credentials and provide connection settings; participating browsers exchange commands and synchronized match state with each other. Shifting Front multiplayer routes do not store room state or campaign progression.</li>
            <li>The site does not request personal information for gameplay, and the game does not transmit your saves, progress, preferences, or local diagnostics to us.</li>
            <li>Vercel Web Analytics automatically records page views, including full page loads and client-side navigation.</li>
            <li>No advertising scripts or third-party ad beacons are embedded.</li>
          </ul>

          <h2>3. Local Device Storage</h2>
          <p>
            Shifting Front stores game data on your local device. Campaign progress and mission saves use browser <code>IndexedDB</code>. If IndexedDB is unavailable, the game uses legacy <code>localStorage</code> for saves and displays a notice that save recovery and multi-tab protection are reduced. Preferences and bounded diagnostics telemetry use <code>localStorage</code>. This data includes:
          </p>
          <ul>
            <li><strong>Campaign Progress:</strong> Unlocked operations, best scores, and medal records.</li>
            <li><strong>Save Slots:</strong> Tactical autosaves and manual named mission snapshots.</li>
            <li><strong>Preferences:</strong> Audio volume, music toggles, reduced motion, high-contrast, colorblind modes, and custom keybindings.</li>
            <li><strong>Diagnostics:</strong> Bounded local simulation telemetry (strictly stored on your machine and only exported if you manually click &ldquo;Export Telemetry&rdquo; in Options).</li>
          </ul>

          <h2>4. Managing and Clearing Your Data</h2>
          <p>
            You have control over the game data stored on your device:
          </p>
          <ul>
            <li>You can reset diagnostic telemetry directly from the in-game Options menu.</li>
            <li>You can clear all saved games, progress, and settings at any time by clearing this site&apos;s data in your browser settings. This removes the site&apos;s IndexedDB and localStorage data.</li>
            <li>Clearing browser site data does not delete page-view data already sent to Vercel Web Analytics. Vercel describes its analytics retention and privacy practices in its <a href="https://vercel.com/docs/analytics/privacy-policy">Web Analytics Privacy and Compliance documentation</a>.</li>
          </ul>

          <h2>5. Hosting and Vercel Web Analytics</h2>
          <p>
            Shifting Front is hosted as static assets via Next.js. The hosting infrastructure may log standard HTTP request metadata, such as IP address, user agent, and requested asset path, for routine DDoS protection and network performance. These hosting logs are separate from the local game data described above.
          </p>
          <p>
            Vercel Web Analytics is provided by Vercel Inc. For each analytics data point, Vercel may receive information such as the event timestamp, page URL or route, referrer, filtered query parameters, approximate geolocation, browser and version, operating system and version, device type, and analytics script version. Vercel states that Web Analytics uses anonymized, aggregated data, does not associate data points with an individual or IP address, and does not use third-party cookies. Visitors are identified using a hash created from the incoming request, and the visitor session is automatically discarded after 24 hours. This site currently uses automatic page-view tracking only and does not send custom analytics events.
          </p>
          <p>
            For more information, see <a href="https://vercel.com/docs/analytics/privacy-policy">Vercel&apos;s Web Analytics Privacy and Compliance documentation</a> and <a href="https://vercel.com/legal/privacy-notice">Vercel&apos;s Privacy Notice</a>.
          </p>

      <h2>6. Updates to This Policy</h2>
      <p>
        If architectural modifications introduce new data collection, third-party services, local features, or options, this document will be updated accordingly with a revised effective date.
      </p>
    </LegalDocument>
  );
}
