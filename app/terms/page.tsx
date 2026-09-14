import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Service — Shifting Front",
  description: "Terms of service and open-source licensing conditions for Shifting Front RTS.",
};

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>Command Desk // Protocol Verification</div>
          <h1 className={styles.title}>Terms of Service</h1>
          <div className={styles.lastUpdated}>Effective Date: September 14, 2026</div>
        </header>

        <section className={styles.content}>
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or playing Shifting Front, you agree to these Terms of Service. If you do not agree to these terms, you should discontinue use of the application.
          </p>

          <h2>2. License &amp; Open Source</h2>
          <p>
            Shifting Front is free software licensed under the <strong>MIT License</strong>. You are free to view the source code, fork, modify, redistribute, and build upon the codebase in accordance with the terms of the MIT License.
          </p>

          <h2>3. Acceptable Use</h2>
          <p>
            You agree to use Shifting Front for lawful purposes only. Because the game runs locally on your device with no server authority or multiplayer competition, you are welcome to experiment with client-side modifications, custom seeds, or inspection tooling.
          </p>

          <h2>4. Disclaimer of Warranty</h2>
          <p>
            SHIFTING FRONT IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE.
          </p>

          <h2>5. Local Storage &amp; Data Responsibility</h2>
          <p>
            Game progress, named save slots, and settings are stored solely in your local browser storage. We are not responsible for lost saves or lost campaign progress resulting from browser cache clearing, private browsing sessions, or device replacements.
          </p>

          <h2>6. Governing Law</h2>
          <p>
            These terms are governed by and construed in accordance with applicable laws without regard to conflict of law principles.
          </p>
        </section>

        <footer className={styles.footer}>
          <Link href="/" className={styles.backLink}>
            &larr; Return to Main Menu
          </Link>
          <div className={styles.otherLinks}>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
