import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of service · RepairPilot",
  description: "Terms governing access to and use of RepairPilot.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Effective September 12, 2026"
      title="Terms of service"
      intro="These terms govern your access to RepairPilot, repair shop management software operated by Townmedia Labs. By creating an account or using the service, you agree to them."
    >
      <section>
        <h2>Accounts and authority</h2>
        <p>
          You must provide accurate account information and keep sign-in
          credentials secure. If you use RepairPilot for an organization, you
          confirm that you have authority to accept these terms for it. The
          account owner controls staff access and is responsible for activity in
          the account.
        </p>
      </section>

      <section>
        <h2>Using RepairPilot</h2>
        <p>
          RepairPilot provides tools for repair operations, customer records,
          inventory, billing, communications and related workflows. You may use
          the service only for lawful business purposes and in accordance with
          applicable privacy, consumer, communications and payment laws.
        </p>
        <ul>
          <li>Do not access accounts or data without authorization.</li>
          <li>Do not upload malware or interfere with the service.</li>
          <li>Do not send deceptive, unlawful or unsolicited communications.</li>
          <li>Do not resell or reverse engineer the service except where law permits.</li>
        </ul>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          You retain ownership of data you submit. You grant us the limited
          rights needed to host, process, back up and transmit that data to
          provide and secure RepairPilot. You are responsible for the accuracy,
          legality and necessary permissions for customer data and content in
          your account.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          Features you connect to third-party providers, including payment,
          messaging, accounting and identity services, are also governed by
          those providers&apos; terms. RepairPilot does not control their
          availability, fees or decisions. You authorize us to exchange the
          information needed to perform the connected action you request.
        </p>
      </section>

      <section>
        <h2>Plans, fees and changes</h2>
        <p>
          Any price, included usage and billing interval will be shown before a
          paid plan begins. RepairPilot is currently offered in early access
          without requiring a card in the app. We may change features or future
          pricing with notice appropriate to the change. Charges from services
          you connect remain your responsibility.
        </p>
      </section>

      <section>
        <h2>Availability and early access</h2>
        <p>
          We work to keep RepairPilot reliable, but the service may occasionally
          be unavailable for maintenance, incidents or provider failures. Early
          access features may change and may contain errors. Keep any records
          your business is legally required to retain, and review important
          estimates, invoices, tax treatment and customer communications before
          relying on or sending them.
        </p>
      </section>

      <section>
        <h2>Suspension and termination</h2>
        <p>
          You may stop using RepairPilot at any time. We may suspend access to
          protect the service, comply with law, address nonpayment or respond to
          a material breach of these terms. Where practical, we will give notice
          and an opportunity to correct the issue. Provisions that logically
          survive termination, including ownership, disclaimers and liability
          limits, continue to apply.
        </p>
      </section>

      <section>
        <h2>Warranty and liability</h2>
        <p>
          To the extent permitted by law, RepairPilot is provided “as is” and
          without implied warranties. Townmedia Labs is not liable for indirect,
          incidental, special, consequential or punitive damages, lost profits,
          lost business or lost data. Our aggregate liability relating to the
          service will not exceed the amount you paid us for RepairPilot during
          the 12 months before the event giving rise to the claim. Rights that
          cannot legally be excluded remain unaffected.
        </p>
      </section>

      <section>
        <h2>Governing law and contact</h2>
        <p>
          These terms are governed by the laws of Alberta and the federal laws of
          Canada applicable there, without regard to conflict-of-law rules. If a
          dispute arises, contact us first so we can try to resolve it. Questions
          about these terms can be sent to{" "}
          <a href="mailto:townmedialabs@gmail.com">townmedialabs@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
