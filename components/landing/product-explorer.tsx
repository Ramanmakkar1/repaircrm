"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { SHOTS } from "./media";

export const PRODUCT_MODULES = [
  {
    key: "counter",
    anchor: "counter",
    label: "Counter",
    title: "Open your shop. Get straight to work.",
    description:
      "Your everyday tools are ready as soon as you sign in. Start a repair or sale, arrange a pickup and see what needs your attention.",
    points: [
      "New repair and new sale up front",
      "Pickup, payments and customer tools",
      "Counter is Home in both display modes",
    ],
    shot: SHOTS.home,
  },
  {
    key: "repairs",
    anchor: "check-in",
    label: "Repairs",
    title: "A clear path for every repair.",
    description:
      "Check in the device, record the problem and keep the work moving. Your team gets the same notes, parts and status in one repair record.",
    points: [
      "Guided device check-in",
      "Parts, photos and repair notes",
      "Ready-for-pickup tracking",
    ],
    shot: SHOTS.job,
  },
  {
    key: "sales",
    anchor: "payments",
    label: "Sales & payments",
    title: "A counter that keeps up.",
    description:
      "Sell an accessory, create an invoice or collect a repair balance. Keep each payment connected to the customer and the job.",
    points: [
      "Picture-first product selection",
      "Cash, deposits and split payments",
      "Manual or connected card payments",
    ],
    note: "Stripe and Square need your own account, provider credentials and test verification. Record existing card-machine payments manually.",
    shot: SHOTS.sell,
  },
  {
    key: "stock",
    anchor: "stock",
    label: "Stock & purchasing",
    title: "Know what’s on the shelf.",
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
    title: "See what needs your attention.",
    description:
      "Get a clear view of takings, money owed and work on the bench. Move from the overview into the records behind it.",
    points: [
      "Takings and balances at a glance",
      "Repair status across the bench",
      "Easy mode and detailed Full view",
    ],
    note: "Both display modes start at Counter. Shop overview is a separate destination.",
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
          <h2 id="product-title">
            Run your whole repair shop.
            <br />
            From one workspace.
          </h2>
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
              {"note" in item && <p className="site-small">{item.note}</p>}
              <a href="/signup" className="site-text-link">
                Start your shop <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <figure>
              <div className="site-product-image">
                <Image
                  src={item.shot.src}
                  alt={item.shot.alt}
                  width={2048}
                  height={1536}
                  unoptimized
                />
              </div>
              <figcaption>Actual app · Demo shop data</figcaption>
            </figure>
          </div>
        ))}
      </div>
    </section>
  );
}
