import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { SHOTS } from "./media";

export function DeviceExperience() {
  return (
    <section id="devices" className="site-section site-devices" aria-labelledby="devices-title">
      <div className="site-container site-device-layout">
        <div className="site-device-copy">
          <h2 id="devices-title" className="site-h2">At the counter.<br />On the move.</h2>
          <p className="site-lede">
            Repair shop software that fits the way you work. Open the same
            workspace on your mobile phone, a counter tablet or a desktop computer.
          </p>
          <ul>
            <li><Check size={18} aria-hidden="true" />Touch-friendly Easy mode for everyday counter tasks.</li>
            <li><Check size={18} aria-hidden="true" />Full view for detailed records and back-office work.</li>
            <li><Check size={18} aria-hidden="true" />Use your browser, or add the app to your home screen on supported devices.</li>
          </ul>
          <a className="site-text-link" href="/signup">Set up your workspace <ArrowRight size={17} aria-hidden="true" /></a>
        </div>
        <figure className="site-device-preview">
          <div className="site-device-screens">
            <Image className="site-device-tablet" src={SHOTS.home.src} alt={SHOTS.home.alt} width={2048} height={1536} unoptimized />
            <Image className="site-device-phone" src={SHOTS.homePhone.src} alt={SHOTS.homePhone.alt} width={1170} height={2532} unoptimized />
          </div>
          <figcaption>One workspace on tablet and mobile · Actual app, demo shop data</figcaption>
        </figure>
      </div>
    </section>
  );
}
