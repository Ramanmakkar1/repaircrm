import Link from "next/link";
import { ArrowRight } from "lucide-react";

const FEATURES = [
  ["Appointments & enquiries", "Book visits, manage website leads and keep the next customer’s request ready for the counter."],
  ["Customer repair portal", "Give customers a place to check their repair and review shared updates, estimates and invoices."],
  ["Staff access & PINs", "Keep owner, technician and front-desk permissions clear. Set up staff PINs for quick switching on shared devices."],
  ["Printing & shop branding", "Add your shop logo and print repair documents, invoices and labels for the way your counter works."],
  ["Imports & exports", "Bring in customers and products from spreadsheets or CSV. Export customer, invoice and payment data when you need it."],
  ["AI tools & your helper", "Summarise ticket notes, draft customer replies and ask your helper about repairs, stock and today’s numbers."],
] as const;

export function Features() {
  return (
    <section id="features" className="site-section site-features" aria-labelledby="features-title">
      <div className="site-container">
        <div className="site-section-heading">
          <h2 id="features-title">Bookings, staff PINs, printing and imports are in there too</h2>
          <p>From the first enquiry to the final invoice, keep the small tasks that make a repair shop run in the same workspace.</p>
        </div>
        <dl className="site-feature-list">
          {FEATURES.map(([title, description]) => <div key={title}><dt>{title}</dt><dd>{description}</dd></div>)}
        </dl>
        <Link href="/features" className="site-text-link">See every feature <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
