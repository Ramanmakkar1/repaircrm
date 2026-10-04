import Image from "next/image";

import { TabletFrame } from "./device-frame";
import { GLASS_GUARD, SHELF, SHOTS } from "./media";
import { Panel, Serif } from "./ui";

/**
 * Stock with pictures. The left side shows the picture library at work (type a
 * name, the matching photo is suggested); the right is the real Stock screen;
 * the strip underneath is the shelf the library already knows.
 */
export function ShelfSection() {
  return (
    <Panel id="stock" labelledBy="stock-title">
      <div className="mx-auto max-w-[1120px]">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <h2 id="stock-title" className="site-h2">
              Type <Serif>glass guard</Serif>. The right picture appears.
            </h2>
            <p className="site-lede mt-5">
              Stock is a screen of big pictures, not rows of text. Repairs helper has a built-in
              picture library, so a new product name is matched to a photo for you, even with a
              spelling slip. Prefer your own photo? Add it any time.
            </p>

            <div
              role="img"
              aria-label="Typing glass guard into the product name field suggests the Screen protector picture."
              className="mt-8 rounded-2xl bg-(--site-tray) p-4 sm:p-5"
            >
              <p className="text-[12px] font-medium text-neutral-600">Product name</p>
              <div className="mt-1.5 flex items-center rounded-xl border-2 border-[#0b0f1a] bg-white px-4 py-3 text-[18px] text-neutral-900">
                glass guard
                <span aria-hidden="true" className="ml-0.5 h-5 w-0.5 bg-[#0b0f1a]" />
              </div>
              <div className="mt-3 flex items-center gap-4 rounded-xl bg-white p-3">
                <Image
                  src={GLASS_GUARD.src}
                  alt=""
                  width={96}
                  height={96}
                  sizes="96px"
                  className="h-20 w-20 shrink-0 object-contain mix-blend-multiply sm:h-24 sm:w-24"
                />
                <div>
                  <p className="text-[16px] font-semibold text-neutral-900">Screen protector</p>
                  <p className="mt-0.5 text-[14px] text-neutral-600">Picture suggested from the library</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <TabletFrame src={SHOTS.stock.src} alt={SHOTS.stock.alt} />
          </div>
        </div>

        <div className="mt-14 sm:mt-20">
          <p className="max-w-2xl text-[19px] font-medium leading-snug tracking-tight text-neutral-900 sm:text-[22px]">
            We know your shelf: phones, tablets, laptops, consoles, TVs, drones, watches, and the
            parts and accessories that go with them.
          </p>
          <ul className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-3">
            {SHELF.map((item) => (
              <li
                key={item.label}
                className="flex flex-col items-center rounded-2xl border border-neutral-200 bg-white p-1.5 sm:p-2"
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={192}
                  height={192}
                  sizes="(min-width: 640px) 110px, 22vw"
                  className="h-auto w-full mix-blend-multiply"
                />
                <span className="pb-1 pt-0.5 text-center text-[11px] font-medium leading-tight text-neutral-700 sm:text-[12px]">
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
