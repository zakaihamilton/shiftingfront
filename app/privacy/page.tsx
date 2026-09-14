import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Shifting Front",
  description: "Privacy policy for Shifting Front RTS: 100% client-side, zero tracking, local-only storage.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Command Desk // Security Clearance</div>
          <h1 className={styles.title}>Privacy Policy</h1>
          <div className={styles.lastUpdated}>Effective Date: September 14, 2026</div>
        </header>

        <section className={styles.content}>
          <h2>1. Overview</h2>
          <p>
            Shifting Front is designed from the ground up as a standalone, deterministic, client-side browser real-time strategy game. We believe privacy is an absolute operational requirement. We do not track, collect, monetize, or transmit your personal information.
          </p>

          <h2>2. Zero Server-Side Collection</h2>
          <p>
            When you play Shifting Front:
          </p>
          <ul>
            <li>No user account or login is required.</li>
            <li>No personally identifiable information (PII) is requested or transmitted.</li>
            <li>No tracking cookies, fingerprinting scripts, or third-party ad beacons are embedded.</li>
            <li>Game campaign generation and combat simulations occur entirely within your local browser sandbox.</li>
          </ul>

          <h2>3. Local Device Storage</h2>
          <p>
            Shifting Front stores mission and configuration state strictly on your local device using standard browser <code>localStorage</code>. This data includes:
          </p>
          <ul>
            <li><strong>Campaign Progress:</strong> Unlocked operations, best scores, and medal records.</li>
            <li><strong>Save Slots:</strong> Tactical autosaves and manual named mission snapshots.</li>
            <li><strong>Preferences:</strong> Audio volume, music toggles, reduced motion, high-contrast, colorblind modes, and custom keybindings.</li>
            <li><strong>Diagnostics:</strong> Bounded local simulation telemetry (strictly stored on your machine and only exported if you manually click &ldquo;Export Telemetry&rdquo; in Options).</li>
          </ul>

          <h2>4. Managing and Clearing Your Data</h2>
          <p>
            Because all game data resides strictly on your device, you have complete control over it at all times:
          </p>
          <ul>
            <li>You can reset diagnostic telemetry directly from the in-game Options menu.</li>
            <li>You can clear all saved games, progress, and settings at any time by clearing site data or cookies for this domain in your browser settings.</li>
          </ul>

          <h2>5. Third-Party Services</h2>
          <p>
            Shifting Front is hosted as static assets via Next.js. The hosting infrastructure may log standard HTTP request metadata (such as IP address, user agent, and requested asset path) for routine DDoS protection and network performance. No game-related state or telemetry is linked to these server logs.
          </p>

          <h2>6. Updates to This Policy</h2>
          <p>
            If architectural modifications introduce new local features or options, this document will be updated accordingly with a revised effective date.
          </p>
        </section>

        <footer className={styles.footer}>
          <Link href="/" className={styles.backLink}>
            &larr; Return to Main Menu
          </Link>
          <div className={styles.otherLinks}>
            <Link href="/terms">Terms of Service</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
