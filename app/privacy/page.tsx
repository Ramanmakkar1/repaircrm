import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy · RepairPilot",
  description: "How RepairPilot collects, uses, protects and shares information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Effective September 12, 2026"
      title="Privacy policy"
      intro="RepairPilot is repair shop management software operated by Townmedia Labs. This policy explains what information we handle, why we use it and the choices available to you."
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
            <strong>Usage and device information:</strong> IP address, browser,
            device type, timestamps, security events, error logs and the parts
            of RepairPilot you use.
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
          We use information to provide and secure RepairPilot, authenticate
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
          RepairPilot. The shop is responsible for giving its customers any
          required privacy notices, collecting information lawfully and limiting
          staff access. If you are a customer of a repair shop, contact that shop
          first about data in its RepairPilot account.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosure</h2>
        <p>
          We use service providers to host the application and database, store
          files, monitor performance and support integrations. Current core
          infrastructure includes Cloudflare and PlanetScale. When you connect a
          third-party service, information needed for that feature is also
          handled under that provider&apos;s privacy terms. We may disclose
          information when required by law, to protect people or the service, or
          as part of a business transfer with appropriate safeguards.
        </p>
      </section>

      <section>
        <h2>Cookies and authentication</h2>
        <p>
          RepairPilot uses essential cookies and similar browser storage to keep
          you signed in, protect sessions, remember interface preferences and
          support offline behavior. We do not use third-party advertising
          cookies. Google sign-in shares your basic profile and email with us
          only after you choose to continue with Google.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          We keep account and shop information while the account is active and
          as needed for legitimate business, security, backup and legal purposes.
          We use access controls, encrypted connections, audit records and
          infrastructure safeguards designed to protect information. No online
          service can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Account owners can review and update most shop information in the app,
          export supported records and request account deletion. You may also ask
          to access, correct or delete personal information, subject to applicable
          law and necessary identity checks. Disconnecting an integration stops
          future use of that connection but does not automatically delete records
          already created through it.
        </p>
      </section>

      <section>
        <h2>Children and international processing</h2>
        <p>
          RepairPilot is a business service and is not directed to children under
          13. Information may be processed in Canada, the United States or other
          places where our service providers operate, with safeguards required by
          applicable law.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update this policy as RepairPilot changes. We will revise the
          effective date above and provide additional notice when required. For
          privacy questions or requests, email{" "}
          <a href="mailto:townmedialabs@gmail.com">townmedialabs@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
