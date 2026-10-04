import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { SPLITFORMS_SIGNUP_URL } from "@/lib/splitforms";

export function SplitformsPartner() {
  return (
    <section id="splitforms" className="site-section site-splitforms" aria-labelledby="splitforms-title">
      <div className="site-container site-splitforms-layout">
        <div>
          <p className="site-partner-label">Our lead capture partner · Splitforms</p>
          <h2 id="splitforms-title" className="site-h2">From your website.<br />Straight into your shop.</h2>
          <p className="site-lede">We recommend Splitforms for your website’s repair enquiries. Connect your form to RepairsHelper and customer contact details, device information and repair requests arrive directly in your Leads workspace.</p>
          <div className="site-partner-actions">
            <a href={SPLITFORMS_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="site-text-link">Explore Splitforms <ExternalLink size={16} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
            <Link href="/leads" className="site-text-link">Connect your form <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <p className="site-small">Requires a Splitforms account and webhook setup. Webhooks are available on Splitforms paid plans; separate provider fees apply.</p>
        </div>
        <div className="site-partner-flow" aria-label="How website enquiries become leads">
          <div><span>On your website</span><h3>Customer submits an enquiry</h3><p>Their contact details, device and repair request.</p></div>
          <ArrowRight className="site-partner-arrow" size={24} aria-hidden="true" />
          <div><span>Splitforms</span><h3>Your form captures the request</h3><p>The connected webhook delivers the submission.</p></div>
          <ArrowRight className="site-partner-arrow" size={24} aria-hidden="true" />
          <div><span>In RepairsHelper</span><h3>A new lead, ready for your team</h3><p>Review the enquiry and follow up from your shop workspace.</p></div>
        </div>
      </div>
    </section>
  );
}
