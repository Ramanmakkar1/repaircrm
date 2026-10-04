import { ChevronRight } from "lucide-react";

import { Panel, Serif } from "./ui";

/**
 * The email sign-up. It behaves exactly as it always has: a plain GET form to
 * /signup with one field called `email`, which the sign-up page reads to
 * pre-fill its own email box. No JavaScript, no data kept here.
 */
export function SignupEmail({ id }: { id: string }) {
  return (
    <form
      action="/signup"
      method="get"
      className="mx-auto flex w-full max-w-md flex-col items-stretch gap-2 rounded-xl border border-neutral-300 bg-white p-2 sm:flex-row sm:items-center sm:rounded-full sm:pl-5"
    >
      <label htmlFor={id} className="sr-only">
        Your shop’s email
      </label>
      <input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        placeholder="Your shop’s email"
        required
        className="min-h-11 min-w-0 flex-1 bg-transparent px-3 sm:px-0 text-[15px] text-neutral-900 placeholder:text-neutral-600 focus:outline-none"
      />
      <button
        type="submit"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0b0f1a] py-1.5 pl-5 pr-1.5 text-sm font-medium text-white"
      >
        Start free
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15"
        >
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    </form>
  );
}

export function FinalCta() {
  return (
    <Panel
      labelledBy="final-title"
      className="site-final text-center sm:py-24 lg:py-28"
    >
      <h2 id="final-title" className="site-h2 mx-auto max-w-3xl">
        Start with your <Serif>next repair</Serif>
      </h2>
      <p className="site-lede mx-auto mt-5 max-w-xl">
        Bring your repairs, sales and customers together. Create your shop and
        get ready for your next customer.
      </p>
      <div className="mt-9">
        <SignupEmail id="footer-email" />
        <p className="mt-4 text-[13px] text-neutral-600">
          Free during early access · No card needed
        </p>
      </div>
    </Panel>
  );
}
