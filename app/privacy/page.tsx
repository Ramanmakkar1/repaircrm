import Link from "next/link";
import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy · Repairs helper",
  description: "How Repairs helper collects, uses, protects and shares information.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Last updated October 29, 2026"
      title="Privacy policy"
      intro="Repairs helper is repair shop management software operated by Town Media Labs of Edmonton, Alberta, Canada. This policy explains what information we handle, why we use it and the choices available to you."
    >
      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address,
            authentication details, shop name and the settings you choose.
          </li>
          <li>
            <strong>Shop data:</strong> information you or your staff enter about
            customers, devices, tickets, inventory, estimates, invoices,
            payments, appointments, notes and uploaded files.
          </li>
          <li>
            <strong>Feedback and support:</strong> reports, feature requests,
            page references and optional follow-up contact details you submit,
            plus your account identifiers when signed in.
          </li>
          <li>
            <strong>Usage and device information:</strong> IP address, browser,
            device type, timestamps, security events, error logs and the parts
            of Repairs helper you use, including how you interact with pages
            (see Analytics below).
          </li>
          <li>
            <strong>Integration information:</strong> identifiers and limited
            connection details needed when you connect services such as Google,
            Stripe, email, SMS or accounting providers.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use information to provide and secure Repairs helper, authenticate
          users, operate shop workflows, deliver requested messages, process
          connected-service actions, answer support requests, diagnose failures,
          prevent abuse and improve reliability. We do not sell personal
          information or use shop data to advertise to your customers.
        </p>
      </section>

      <section>
        <h2>Your responsibility for customer data</h2>
        <p>
          A shop controls the customer and repair data it enters into
          Repairs helper. The shop is responsible for giving its customers any
          required privacy notices, collecting information lawfully and limiting
          staff access. If you are a customer of a repair shop, contact that shop
          first about data in its Repairs helper account.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosure</h2>
        <p>
          The Repairs helper application, its PostgreSQL database and uploaded
          files run on our own server in Alberta, Canada. We use service
          providers for the rest: Cloudflare for our network, content delivery
          and DNS; Hostinger to send email; OpenAI to process the information
          an AI feature needs when AI features are enabled; and Microsoft
          Clarity for analytics (see below). When you connect a third-party
          service, information needed for that feature is also handled under
          that provider&apos;s privacy terms. We may disclose
          information when required by law, to protect people or the service, or
          as part of a business transfer with appropriate safeguards.
        </p>
      </section>

      <section>
        <h2>Cookies and authentication</h2>
        <p>
          Repairs helper uses essential cookies and similar browser storage to keep
          you signed in, protect sessions, remember interface preferences and
          support offline behavior. We do not use third-party advertising
          cookies. Google sign-in is optional; it shares your basic profile and
          email with us only after you choose to continue with Google.
        </p>
      </section>

      <section>
        <h2>Analytics</h2>
        <p>
          We use Microsoft Clarity to understand how people use Repairs helper
          and to improve it. Clarity sets cookies and records how you interact
          with pages, such as clicks, scrolling and mouse movement, to produce
          heatmaps and session replays. Microsoft processes this information as
          described in the{" "}
          <a href="https://www.microsoft.com/privacy/privacystatement" target="_blank" rel="noopener noreferrer">
            Microsoft Privacy Statement
          </a>
          .
        </p>
      </section>

      <section>
        <h2>The iPhone, iPad and Android apps</h2>
        <p>
          The Repairs helper apps show this same service and handle the same
          information. The camera is used only when you take a ticket photo or
          scan a barcode; the microphone only while you dictate or talk to the
          voice assistant, and that audio is sent to our speech-to-text provider
          to be turned into text. If you allow notifications, we store your
          phone&apos;s push token with your login, send alerts through Apple Push
          Notification service or Firebase Cloud Messaging, and delete the token
          when you sign out or delete your login. The apps contain no
          advertising and no third-party analytics, and do not track you across
          other companies&apos; apps or websites.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          We keep account and shop information while the account is active and
          as needed for legitimate business, security, backup and legal purposes.
          Database backups are taken nightly and only the most recent few are
          kept, so deleted information leaves our backups within a week.
          We use access controls, encrypted connections, audit records and
          infrastructure safeguards designed to protect information. No online
          service can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Account owners can review and update most shop information in the app,
          export supported records and delete their account or their whole shop
          in the app at any time (see <Link href="/delete-account">how account
          deletion works</Link>). A deleted shop can be restored for 7 days, then
          its records and files are erased. When a staff member deletes their own
          login, their name and contact details are removed but the shop keeps
          the work records they created, shown as &ldquo;Deleted user&rdquo;. You may also ask
          to access, correct or delete personal information, subject to applicable
          law and necessary identity checks. Disconnecting an integration stops
          future use of that connection but does not automatically delete records
          already created through it.
        </p>
      </section>

      <section>
        <h2>Children and international processing</h2>
        <p>
          Repairs helper is a business service and is not directed to children under
          13. Our application, database and uploaded files are hosted in Alberta,
          Canada. Information may also be processed in the United States or other
          places where our service providers operate, with safeguards required by
          applicable law.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update this policy as Repairs helper changes. We will revise the
          date above and provide additional notice when required. For
          privacy questions or requests, email{" "}
          <a href="mailto:support@repairshelper.com">support@repairshelper.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
