import { Check } from "lucide-react";
import { SHOTS } from "./media";

/** The three phone captures, so this section does not repeat the hero's tablet. */
const PHONES = [SHOTS.invoicePhone, SHOTS.jobPhone, SHOTS.homePhone] as const;

export function DeviceExperience() {
  return (
    <section id="devices" className="site-section site-devices" aria-labelledby="devices-title">
      <div className="site-container site-device-layout">
        <div className="site-device-copy">
          <h2 id="devices-title" className="site-h2">Use it on the counter tablet or your phone</h2>
          <p className="site-lede">
            The same shop opens on a phone, a counter tablet or a desktop
            computer. Start a repair at the counter and check on it from the
            bench.
          </p>
          <ul>
            <li><Check size={18} aria-hidden="true" />Easy mode: big touch buttons for everyday counter tasks.</li>
            <li><Check size={18} aria-hidden="true" />Full view: detailed tables for records and back-office work.</li>
            <li><Check size={18} aria-hidden="true" />Runs in the browser. Add it to your home screen on supported devices.</li>
          </ul>
        </div>
        <figure className="site-device-preview">
          <div className="site-phone-row" tabIndex={0} aria-label="Phone screens, scrollable">
            {PHONES.map((shot) => (
              // eslint-disable-next-line @next/next/no-img-element -- served as captured
              <img
                key={shot.src}
                src={shot.src}
                alt={shot.alt}
                width={1170}
                height={2532}
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
          <figcaption>An invoice, a repair job and Home on a phone · Actual app, demo shop data</figcaption>
        </figure>
      </div>
    </section>
  );
}
