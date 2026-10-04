# Things only you can do

Written 2026-10-03, updated 2026-10-04. Everything here needs your decision, your accounts or your
hands. I changed no keys or accounts; the commit and the deploy were done when you asked.

## 1. Protect and publish the work (do this first)

- [x] **Commit the work.** Done: pushed to `main` (application release `08c2020`, CI green).
- [x] **Deploy to the live site.** Done 4 Oct 2026: repairshelper.com runs `08c2020`.
      The steps are in the deploy note (git archive of a pushed commit, then
      `/usr/local/sbin/repairshelper-deploy` on the server, which backs up the database
      first and puts the old code back if the health check fails). The app uses each shop’s time zone and the server has current Alberta timezone data; see docs/FIX-LIST.md.
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
- [ ] **Text-message consent.** The verified new-customer form starts text updates OFF. Confirm your shop’s consent process before enabling messages for customers.
- [x] **Duplicate customers.** Requested 4 Oct: warn on an existing phone number and require an explicit override to create a separate customer. Deployed.
- [x] **Split payment.** Requested 4 Oct and implemented for sales and invoice payments. See the setup notes below.
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
- [x] Dark theme: the assistant’s Talk control now uses paired theme colours. Browser check: dark text rgb(17,18,20) on rgb(241,242,243), 48px height.
- [ ] Newer version of the design tool available (`npx impeccable update`): optional.

## 6. Set up the new counter features

- Each staff member sets their own six-digit PIN under **Settings → My profile** using their current password. Use **Switch staff** in the account menu on a shared tablet. Accounts with two-step sign-in keep full sign-in.
- Upload your shop logo under **Settings → Shop details** (PNG, JPEG or WebP, up to 2 MB).
- On each personal phone, open **My profile → Phone notifications**, opt in and send a test. On iPhone, add the app to the Home Screen first. Check delivery with the app closed; alerts follow the automation interval. Do not opt a shared tablet into someone’s private notifications.
- For **Cash + card**, approve the displayed card remainder on your separate card machine before recording both parts. This does not initiate a connected-reader split charge.

For local development, use Node 22.23.3 as pinned in `.nvmrc`. The Mac’s previous Node 22.22.3 has outdated Alberta timezone data; verification used a temporary current runtime without replacing the system installation.
