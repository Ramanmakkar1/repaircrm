# Things only you can do

Written 2026-10-03. Everything here needs your decision, your accounts or your
hands. I did not do any of it (no commits, no deploys, no key changes).

## 1. Protect and publish the work (do this first)

- [ ] **Commit the work.** More than 100 files of new work are not saved in git yet
      (the Home, the picture library, all the page restyles, the fixes). A copy of the
      state from before today's fixes is in `app-backup-before-fixes-2026-10-03.tar.gz`
      in the project folder, but git is the real safety net. Tell me "commit it" and I will
      do it on a branch and show you the summary first. Nothing is pushed to GitHub until
      you say so.
- [ ] **Deploy to the live site.** repairshelper.com is still running the 30 Sep release.
      Deploys are manual (`ops/deploy.sh` on the server); the step that builds the release
      archive from your Mac is not written down anywhere. Ask me to write that script.
      A new database column (the chosen product picture) is added by a migration that
      the deploy script applies for you.
- [ ] **Back up off the server.** Daily backups are only stored on the same server as the
      database. Copy them somewhere else (another machine or a storage bucket) and try
      one restore. If the server is lost today, everything entered since launch is lost.

## 2. Accounts and keys (I cannot and should not handle these)

- [ ] **AI key.** Put your OpenAI key in the server's private `app.env`
      (`OPENAI_API_KEY`, plus `AI_DRIVER` / `STT_DRIVER`). Then test the assistant and the
      microphone on a real phone. The assistant's model names and its strict answer format
      were checked against the docs but never run against the live service.
- [ ] **Payments.** Stripe / Square keys, webhook secrets and the webhook URL in each
      provider's dashboard (`docs/PAYMENT-PROVIDER-SETUP.md`). Keep `PAYMENTS_DRIVER=off`
      until you have run a test payment in the provider's test mode.
- [ ] **Email going to Junk.** Welcome emails from the server land in Junk. Fix the sender
      domain records (SPF / DKIM / DMARC) or switch the email provider.

## 3. Try it on real devices (nobody has done this yet)

- [ ] iPad, iPhone and an Android phone: sign in, add to the home screen, open Home, take a
      repair through New repair, ring up a sale, use the microphone, scan a barcode.
- [ ] Look for: the on-screen keyboard covering buttons, the bottom tab bar over the Pay
      button, anything too small to tap with a finger.

## 4. Decisions only you can make

- [ ] **Voice language.** Voice now starts in live English. It used to auto-detect Hindi,
      Punjabi and Hinglish through the cloud service. Which should be the default?
- [ ] **Text-message consent.** The new customer form switches on "Text repair updates"
      as soon as a phone number is typed. Many places require express consent for
      marketing-style texts; the safe default is OFF.
- [ ] **Duplicate customers.** Adding a customer never warns you that the same phone number
      already exists. Warn, block, or leave as is?
- [ ] **Split payment** (part cash, part card) is not built. Do you need it?
- [ ] **Assistant stock changes.** Adding or changing stock by voice runs immediately with no
      confirmation tap (removing a product does ask). Keep or add a confirm?
- [ ] **Negative stock** is allowed (so you can sell before you receive). Keep?
- [ ] **Which Figma file** is the real design: `0YgZyIraJUqerkvgBccKTz` or
      `4gyxkYOKEuTllzP2iZ1EAX`?
- [ ] **Automatic internet photos.** The app still looks up photos on Wikimedia for products
      that have no picture. With your own picture library you may want that turned off.

## 5. Tidy-up (safe, low priority)

- [ ] Delete 13 finished branches and 13 dead worktree records (all already merged; I can run
      the exact commands when you say so).
- [ ] The old Cloudflare files (`wrangler.jsonc`, the `cf:*` scripts) describe a setup that no
      longer exists. Delete when you are sure you will never go back.
- [ ] The Excel import library comes from SheetJS's own server, so deploys need that site
      reachable. Fine today; worth knowing.
- [ ] Two generated pictures resemble real products' shapes (the earbuds and the delivery van);
      there are no logos. Swap them if you want purely generic pictures.
- [ ] Dark theme: the assistant's "Talk" button label is nearly invisible. (Small fix.)
- [ ] Newer version of the design tool available (`npx impeccable update`): optional.
