import Image from "next/image";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { PublicSite } from "@/components/public/public-site";

import { AuthFrame } from "./auth-frame";

/**
 * The sign-in family (sign in, create a shop, email code, forgot / reset /
 * change password, two-step code): one calm card inside the public site's
 * header and footer, which also carry Privacy and Terms, because every one of
 * these screens takes personal details.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PublicSite>
      <div className="w-full px-4 pt-6 pb-14 sm:px-8 sm:pt-10 sm:pb-20">
        <AuthFrame aside={<SignupBenefits />}>{children}</AuthFrame>
      </div>
    </PublicSite>
  );
}

const BENEFITS = [
  "Check in a repair, track it on the bench and hand it back",
  "Sell at the counter, send invoices and keep stock counts",
  "Customers check their own repair status online",
  "Works on a phone, a counter tablet or a desktop",
] as const;

/** What a new shop gets, beside the create-a-shop form on wide screens. */
function SignupBenefits() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_200px] items-center gap-10">
      <div>
        <p className="text-sm font-semibold text-(--site-accent-ink)">Free during early access</p>
        <h2 className="mt-3 text-[2.25rem] leading-[1.12] font-bold tracking-[-0.045em] text-balance">
          Your whole repair counter in one place.
        </h2>
        <ul className="mt-7 space-y-4">
          {BENEFITS.map((line) => (
            <li key={line} className="flex items-start gap-3 text-base leading-relaxed text-(--site-muted)">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-(--accent-soft) text-(--site-accent-ink)">
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <Image
        src="/marketing/app/job-phone.webp"
        alt="A repair job open in Repairs helper on a phone"
        width={1170}
        height={2532}
        sizes="200px"
        className="h-auto w-full rounded-[28px] border-[6px] border-neutral-900 bg-neutral-900 shadow-xl"
      />
    </div>
  );
}
