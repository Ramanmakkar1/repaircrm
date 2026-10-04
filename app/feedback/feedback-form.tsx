"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { FEEDBACK_KINDS } from "@/lib/product-feedback";
import { submitFeedbackAction } from "./actions";

export function FeedbackForm({ returnHref }: { returnHref: string }) {
  const [state, action, pending] = useActionState(submitFeedbackAction, {});
  if (state.success) return (
    <div className="site-feedback-success" role="status">
      <CheckCircle2 size={36} aria-hidden="true" />
      <h2>Thanks. Your feedback is saved.</h2>
      <p>The RepairsHelper team can now review your report. If you included an email, we can contact you if we need more detail.</p>
      <Link href={returnHref} className="site-button">Continue <ArrowRight size={17} aria-hidden="true" /></Link>
    </div>
  );
  return (
    <form action={action} className="site-feedback-form">
      {state.error && <p className="site-feedback-error" role="alert">{state.error}</p>}
      <fieldset>
        <legend>What would you like to share?</legend>
        <div className="site-feedback-types">
          {FEEDBACK_KINDS.map((kind) => (
            <label key={kind.value}><input type="radio" name="kind" value={kind.value} defaultChecked={(state.values?.kind || "BUG") === kind.value} required />{kind.label}</label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="feedback-title">Short title<input id="feedback-title" name="title" required minLength={5} maxLength={120} defaultValue={state.values?.title} placeholder="What needs to improve?" /></label>
      <label htmlFor="feedback-detail">Tell us more<textarea id="feedback-detail" name="detail" required minLength={15} maxLength={4000} rows={6} defaultValue={state.values?.detail} placeholder="For a bug: what were you doing, what happened and what did you expect? For a feature: tell us how it would help your shop." /></label>
      <label htmlFor="feedback-page">Where did it happen? <span>(optional)</span><input id="feedback-page" name="page" maxLength={200} defaultValue={state.values?.page} placeholder="For example: Counter, repair check-in or /inventory" /></label>
      <label htmlFor="feedback-email">Email for follow-up <span>(optional)</span><input id="feedback-email" name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.values?.email} placeholder="you@shop.com" /></label>
      <div className="site-feedback-honey" aria-hidden="true"><label htmlFor="feedback-website">Leave this empty<input id="feedback-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="site-small">Please leave out passwords, payment details and private customer information. Your report is shared with the RepairsHelper team. <Link href="/privacy">Privacy policy</Link></p>
      <button type="submit" className="site-button" disabled={pending}>{pending ? "Saving your report…" : "Send feedback"}<ArrowRight size={17} aria-hidden="true" /></button>
    </form>
  );
}
