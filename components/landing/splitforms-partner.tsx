import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { SPLITFORMS_SIGNUP_URL } from "@/lib/splitforms";

/**
 * A compact integrations strip. The setup caveats (paid Splitforms plan for
 * webhooks) live in the FAQ's "What needs setup" entry.
 */
export function SplitformsPartner() {
  return (
    <section id="splitforms" className="site-splitforms" aria-labelledby="splitforms-title">
      <div className="site-container site-splitforms-layout">
        <p className="site-partner-label">Integration · Splitforms</p>
        <div>
          <h2 id="splitforms-title">Website repair enquiries land in Leads</h2>
          <p>
            Connect a Splitforms form on your website and each enquiry arrives
            in Repairs helper with the customer’s contact details, the device
            and the problem.
          </p>
        </div>
        <div className="site-partner-actions">
          <a href={SPLITFORMS_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="site-text-link">
            Splitforms <ExternalLink size={16} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {/* Leads needs a signed-in shop, and signup does not carry a ?next= target. */}
          <Link href="/signup" className="site-text-link">
            Create a shop to connect your form <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
