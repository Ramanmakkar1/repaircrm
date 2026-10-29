"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { SHOTS } from "./media";

export const PRODUCT_MODULES = [
  {
    key: "counter",
    anchor: "counter",
    label: "Counter",
    title: "New repair and New sale on the first screen",
    description:
      "Your everyday tools are ready as soon as you sign in. Start a repair or sale, arrange a pickup and see what needs your attention.",
    points: [
      "New repair and new sale up front",
      "Pickup, payments and customer tools",
      "Counter is Home in both display modes",
    ],
    shot: SHOTS.home,
    phone: SHOTS.homePhone,
  },
  {
    key: "repairs",
    anchor: "check-in",
    label: "Repairs",
    title: "One ticket holds the device, parts, photos and notes",
    description:
      "Check in the device, record the problem and keep the work moving. Your team gets the same notes, parts and status in one repair record.",
    points: [
      "Guided device check-in",
      "Parts, photos and repair notes",
      "Ready-for-pickup tracking",
    ],
    shot: SHOTS.job,
    phone: SHOTS.jobPhone,
  },
  {
    key: "sales",
    anchor: "payments",
    label: "Sales & payments",
    title: "Sell a case and collect a repair balance on one screen",
    description:
      "Sell an accessory, create an invoice or collect a repair balance. Keep each payment connected to the customer and the job.",
    points: [
      "Picture-first product selection",
      "Cash, deposits and split payments",
      "Manual or connected card payments",
    ],
    shot: SHOTS.sell,
    phone: SHOTS.invoicePhone,
  },
  {
    key: "stock",
    anchor: "stock",
    label: "Stock & purchasing",
    title: "Stock counts with a picture for every part",
    description:
      "Find the right part without losing your place. Product pictures, quantities and purchasing live alongside the repairs that need them.",
    points: [
      "Parts and accessories with pictures",
      "Stock quantities and purchasing",
      "Spreadsheet and CSV product imports",
    ],
    shot: SHOTS.stock,
  },
  {
    key: "overview",
    anchor: "modes",
    label: "Shop overview",
    title: "Takings, money owed and the bench, at a glance",
    description:
      "Get a clear view of takings, money owed and work on the bench. Move from the overview into the records behind it.",
    points: [
      "Takings and balances at a glance",
      "Repair status across the bench",
      "Easy mode and detailed Full view",
    ],
    shot: SHOTS.dashboard,
  },
] as const;

export function ProductExplorer() {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const selectHash = () => {
      const index = PRODUCT_MODULES.findIndex(
        (item) => `#${item.anchor}` === window.location.hash,
      );
      if (index >= 0) {
        setActive(index);
        buttons.current[index]?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    };
    selectHash();
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, []);
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % PRODUCT_MODULES.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + PRODUCT_MODULES.length) % PRODUCT_MODULES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PRODUCT_MODULES.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }
  return (
    <section
      id="product"
      className="site-section site-product"
      aria-labelledby="product-title"
    >
      <div className="site-container">
        <div className="site-section-heading">
          <h2 id="product-title">The five screens your counter uses all day</h2>
          <p>
            Repair management, point of sale and inventory in one connected
            workspace. Check in a device, find the right part and collect the
            balance, with your team working from the same records.
          </p>
        </div>
        <div className="site-anchor-targets" aria-hidden="true">
          {PRODUCT_MODULES.map((item) => (
            <span id={item.anchor} key={item.key} />
          ))}
        </div>
        <div
          role="tablist"
          aria-label="Explore shop tools"
          className="site-product-tabs"
        >
          {PRODUCT_MODULES.map((item, index) => (
            <button
              key={item.key}
              id={`product-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls={`product-panel-${item.key}`}
              tabIndex={active === index ? 0 : -1}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKey(event, index)}
            >
              {item.label}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        {PRODUCT_MODULES.map((item, index) => (
          <div
            key={item.key}
            id={`product-panel-${item.key}`}
            role="tabpanel"
            aria-labelledby={`product-tab-${item.key}`}
            tabIndex={0}
            hidden={active !== index}
            className="site-product-panel"
          >
            <div className="site-product-copy">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>
                    <Check size={17} aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="site-text-link">
                Start free <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <figure>
              <div
                className={`site-product-image ${"phone" in item ? "has-phone" : "site-shot-crop"}`}
              >
                <picture>
                  {"phone" in item && (
                    <source
                      media="(max-width: 639px)"
                      srcSet={item.phone.src}
                      width={1170}
                      height={2532}
                    />
                  )}
                  <img
                    src={item.shot.src}
                    alt={item.shot.alt}
                    width={2048}
                    height={1536}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </div>
              <figcaption>Actual app · Demo shop data</figcaption>
            </figure>
          </div>
        ))}
      </div>
    </section>
  );
}
