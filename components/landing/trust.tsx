import { Download, Mail, MapPin, Server } from "lucide-react";

export const SUPPORT_EMAIL = "support@repairshelper.com";

/**
 * Facts a shop owner can check, in place of logos or ratings we do not have.
 * Keep every line literally true; the CSV exports are the routes under
 * app/api/exports (customers, invoices, payments and the report exports).
 */
export function TrustBand() {
  return (
    <section className="site-trust" aria-labelledby="trust-title">
      <div className="site-container">
        <h2 id="trust-title">Who runs Repairs helper</h2>
        <ul>
          <li>
            <MapPin size={20} aria-hidden="true" />
            <span>
              <strong>Built in Edmonton, Alberta</strong>
              Made by Town Media Labs in Canada.
            </span>
          </li>
          <li>
            <Server size={20} aria-hidden="true" />
            <span>
              <strong>Hosted in Alberta, Canada</strong>
              The app and its database run on our own server, behind Cloudflare.
            </span>
          </li>
          <li>
            <Download size={20} aria-hidden="true" />
            <span>
              <strong>Your records leave with you</strong>
              Export customers, invoices, payments and reports to CSV.
            </span>
          </li>
          <li>
            <Mail size={20} aria-hidden="true" />
            <span>
              <strong>Email support</strong>
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
