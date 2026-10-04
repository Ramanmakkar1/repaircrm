import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";

const assets = "/marketing/figma";
const jobs = [
  ["01", "Check it in", "Customer, device, fault and a promised time on one form. Add a new customer right there, and print the work order when you’re ready."],
  ["02", "Fix it", "Run the job from the bench or your phone: checklist, parts, timer and photos. Keep the whole repair history together."],
  ["03", "Hand it back", "Let the customer know it’s ready. Take the balance on your card machine or in cash, and record the payment with the repair."],
];
const questions = [
  ["Do I need new hardware?", "No. Repairs helper runs in the browser on the tablet, phone or computer you already have. Use a supported connected terminal, or record payments from your existing card machine."],
  ["Can I switch between Easy mode and Full view?", "Yes. Easy mode gives you big picture boxes for the counter: New repair and New sale are always one tap away. Full view adds the detailed dashboard and dense tables. Both use the same records, and every tool stays reachable from Home under More tools."],
  ["What can the AI assistant do?", "Look up shop information, summarize repair tickets, draft customer replies and help with everyday tasks. Type a request or use voice input. The assistant asks you to confirm changes and respects shop permissions. A connected AI provider is required."],
  ["Can I bring my customers and stock with me?", "Yes. Import customers and products from CSV, review the preview, then save. Complete repair-history imports from other systems are not available yet."],
  ["Where do website enquiries go?", "Into Leads. Connect a Splitforms form on your website to collect the device, the problem and the customer’s contact details."],
];

function SignupEmail({ id }: { id: string }) {
  return <form action="/signup" method="get" className="rh-email-form">
    <label htmlFor={id} className="sr-only">Your shop’s email</label>
    <input id={id} name="email" type="email" autoComplete="email" placeholder="Your shop’s email" required />
    <button type="submit" className="rh-button">Start free</button>
  </form>;
}
function ProductImage({ name, alt, className = "", priority = false }: { name: string; alt: string; className?: string; priority?: boolean }) {
  return <div className={`rh-figma-image ${className}`}><Image src={`${assets}/${name}.png`} alt={alt} fill priority={priority} sizes="(max-width: 767px) 100vw, 1080px" className="object-cover" /></div>;
}

export function RepairsHome() {
  return <div className="rh-home">
    <header className="rh-nav">
      <Link href="/" className="rh-brand" aria-label="Repairs helper home"><RepairPilotMark className="size-10" /><RepairPilotWordmark className="text-lg" /></Link>
      <nav aria-label="Main navigation"><a href="#product">Product</a><a href="#assistant">AI assistant</a><a href="#payments">Payments</a><a href="#pricing">Pricing</a></nav>
      <div className="rh-nav-actions"><Link href="/login">Sign in</Link><Link href="/signup" className="rh-button">Start free</Link></div>
    </header>
    <main>
      <section className="rh-hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Every repair. Every payment.<br />One calm screen.</h1>
        <p>Check devices in, fix them, get paid and keep customers posted —<br className="hidden sm:block" /> from the counter tablet, the bench phone or the desk.</p>
        <div className="rh-hero-actions"><SignupEmail id="hero-email" /><a href="#product" className="rh-button rh-button-secondary">Explore the workspace</a></div>
        <small>Free during early access · No card needed</small>
        <ProductImage name="desktop-dashboard" alt="Repair workspace showing jobs, repair statuses and the navigation sidebar" className="rh-dashboard-preview" priority />
      </section>
      <section className="rh-made-for" aria-label="Supported repair shops"><p>Made for independent shops that repair</p><div>{["Phones", "Tablets", "Laptops", "Consoles", "Watches", "Drones"].map(x=><span key={x}>{x}</span>)}</div></section>
      <section id="product" className="rh-container rh-section">
        <h2>Three jobs a repair shop does all day.<br className="hidden md:block" /> Each one is a single screen.</h2>
        <ProductImage name="tablet-counter" alt="A repair shop counter with a tablet and card terminal" className="rh-counter-photo" />
        <div className="rh-jobs">{jobs.map(([n,title,copy])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section id="assistant" className="rh-assistant rh-section">
        <div className="rh-container"><p className="rh-eyebrow">YOUR AI REPAIR ASSISTANT</p><h2>Ask your shop anything.</h2><p className="rh-section-intro">Type it or press Talk. Find the right information, open the right screen,<br className="hidden md:block" /> and review proposed changes before they happen.</p>
          <ul className="rh-prompts">{["What’s ready for pickup?", "Mark 1042 in progress", "Who owes us money?", "How did we do today?"].map(x=><li key={x}>“{x}”</li>)}</ul>
          <ProductImage name="desktop-assistant" alt="Repair workspace with the AI shop assistant open and example task suggestions" className="rh-assistant-preview" />
          <p className="rh-caption">AI features require a connected provider. Voice support depends on your browser and shop setup.</p>
        </div>
      </section>
      <section id="payments" className="rh-container rh-section rh-payments">
        <div><h2>Keep the card machine<br className="hidden xl:block" /> you already have.</h2><p className="rh-section-intro">Choose how Card works at your counter. If your connected machine won’t answer, switch to manual and keep the queue moving.</p><dl className="rh-payment-options"><div><dt>Automatic</dt><dd>Send the amount to a supported Stripe or Square terminal. Once the payment is confirmed, the sale is marked paid.</dd></div><div><dt>Manual</dt><dd>Use your existing bank terminal. Enter the amount, then record the approved payment in your workspace.</dd></div><div><dt>Cash and store credit</dt><dd>See change due clearly, take a deposit at check-in and apply store credit at the till.</dd></div></dl></div>
        <ProductImage name="desktop-pos" alt="Point-of-sale workspace with inventory items and a customer checkout" className="rh-pos-preview" />
      </section>
      <section className="rh-bench">
        <Image src={`${assets}/bench-tech.png`} alt="Technician repairing a device at the workbench" fill sizes="100vw" className="object-cover" />
        <div className="rh-bench-content"><div className="rh-bench-copy"><h2>The bench runs on<br />the tech’s phone.</h2><p>Easy mode turns any phone or tablet into big, clear picture boxes. Repairs, customers, parts and appointments are one tap away.</p><p>Switch to Full view whenever you need it. All your features, one shared workspace.</p><small>Install it to the home screen for quick access to your shop.</small></div><div className="rh-phone"><Image src={`${assets}/phone-counter.png`} alt="Mobile repair workspace with large task buttons" fill sizes="232px" className="object-cover" /></div></div>
      </section>
      <section className="rh-container rh-section rh-leads"><div><h2>Website enquiries<br />arrive as leads. No code.</h2><p className="rh-section-intro">Connect your Splitforms website form with one webhook link. Each enquiry lands in Leads with the device, the fault and how to reach the customer.</p><a href="https://splitforms.com" target="_blank" rel="noreferrer" className="rh-text-link">Forms powered by Splitforms <ArrowRight size={17} /></a></div><div className="rh-lead-list" aria-label="Example enquiries">{[["Jenna W. · Surface Laptop won’t charge","Website form","2 min"],["Marcus L. · iPhone 14 — cracked back glass","Website form","18 min"],["Aisha R. · PS5 HDMI port, no picture","Walk-in","1 h"]].map(([name,source,time])=><div key={name}><span><strong>{name}</strong><small>{source}</small></span><small>{time}</small></div>)}<p className="rh-caption">Illustrative enquiries</p></div></section>
      <section id="pricing" className="rh-pricing"><div className="rh-container"><div className="rh-price"><strong>$0</strong><span>during early access</span></div><ul><li><Check /> Core tools on every device</li><li><Check /> Bring your staff and locations</li><li><Check /> Connected providers may charge usage fees</li><li><Check /> Future pricing announced in advance</li></ul><Link href="/signup" className="rh-button">Start free</Link></div></section>
      <section className="rh-container rh-section rh-faq"><h2>Questions shop<br />owners ask first</h2><div>{questions.map(([q,a],i)=><details key={q} open={i===0}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>)}</div></section>
      <section className="rh-final"><h2>Open tomorrow with the whole shop<br className="hidden md:block" /> on one calm screen.</h2><SignupEmail id="footer-email" /><p>Start with your next repair. We’ll help you get organized.</p></section>
    </main>
    <footer className="rh-footer"><div className="rh-container"><div className="rh-footer-main"><Link href="/" className="rh-brand"><RepairPilotMark className="size-12" /><RepairPilotWordmark className="text-2xl" /></Link><nav aria-label="Footer product"><span>Product</span><a href="#product">Check-in & repairs</a><a href="#payments">Payments</a><a href="#assistant">AI assistant</a></nav><nav aria-label="Footer shop"><span>Shop</span><Link href="/login">Sign in</Link><Link href="/portal">Check your repair</Link><a href="#pricing">Pricing</a></nav><nav aria-label="Legal"><span>Legal</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></div><div className="rh-footer-bottom"><span>© {new Date().getFullYear()} Repairs helper · Townmedia Labs</span><span>Made for independent repair shops</span></div></div></footer>
  </div>;
}
