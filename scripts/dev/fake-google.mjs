#!/usr/bin/env node
/**
 * A stand-in Google identity provider, for development only.
 *
 * WHY THIS EXISTS
 * ---------------
 * "Sign in with Google" cannot be verified without Google credentials, and "it
 * compiles" is not verification for the code that decides who gets into a
 * shop. This server speaks the same protocol as the real thing — the consent
 * redirect, the token endpoint and the JWKS endpoint — so the whole flow can be
 * exercised end to end against it.
 *
 * It is NOT a mock inside the app. The app makes real HTTP requests, PKCE is
 * really checked, and the id_tokens are REAL RS256 JWTs signed with a key pair
 * generated at boot and published at this server's own JWKS endpoint. The
 * signature verification in lib/google/oidc.ts is therefore genuinely
 * exercised, not stubbed out.
 *
 * The tokens claim `iss: https://accounts.google.com` and the configured
 * `aud`, exactly as an impostor would — which is what makes those checks in
 * the app real checks rather than formalities.
 *
 *   GOOGLE_CLIENT_ID=fake-client.apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=fake-secret
 *   GOOGLE_AUTH_BASE=http://127.0.0.1:4320
 *   GOOGLE_TOKEN_URL=http://127.0.0.1:4320/token
 *   GOOGLE_JWKS_URL=http://127.0.0.1:4320/oauth2/v3/certs
 *
 * Run:  node scripts/dev/fake-google.mjs [port]
 *
 * The consent screen is a real HTML page you can click through in a browser.
 * It also accepts every choice as a query parameter, so a shell script can
 * drive the whole matrix without a browser:
 *
 *   GET /o/oauth2/v2/auth?...&x_auto=1&x_email=a@b.com&x_verified=0&x_flaw=aud
 *
 * FLAWS, for proving the app's checks actually fail closed:
 *   x_flaw=aud      id_token minted for a different audience
 *   x_flaw=iss      issuer is not Google
 *   x_flaw=nonce    a nonce that is not the one the app sent
 *   x_flaw=expired  exp an hour in the past
 *   x_flaw=sig      signed with a key pair that is NOT in the JWKS
 *   x_flaw=alg      alg: none, unsigned
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * No account database, no consent memory, no refresh tokens, no discovery
 * document. A fixture that grows into a second implementation of Google is a
 * fixture nobody trusts.
 */

import { createServer } from "node:http";
import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";

const PORT = Number(process.argv[2] ?? process.env.FAKE_GOOGLE_PORT ?? 4320);
const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ?? "fake-client.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "fake-secret";
const ISSUER = "https://accounts.google.com";

// ---------------------------------------------------------------------------
// Keys — a real RSA pair, generated once per process
// ---------------------------------------------------------------------------

function makeKey(kid) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  // generateKeyPairSync hands back KeyObjects already; exporting the public
  // half as a JWK is exactly what a JWKS endpoint publishes.
  const jwk = publicKey.export({ format: "jwk" });
  return { kid, private: privateKey, jwk: { ...jwk, kid, use: "sig", alg: "RS256" } };
}

/** The published key. */
const SIGNING = makeKey(`fake-${randomUUID().slice(0, 8)}`);
/** Never published. `x_flaw=sig` signs with this one. */
const ROGUE = makeKey(SIGNING.kid);

// ---------------------------------------------------------------------------
// JWT minting
// ---------------------------------------------------------------------------

const b64u = (input) =>
  Buffer.from(input).toString("base64url");

function mintIdToken(claims, flaw) {
  if (flaw === "alg") {
    // Unsigned. A verifier that trusts `alg` from the header falls for this.
    const header = b64u(JSON.stringify({ alg: "none", typ: "JWT" }));
    return `${header}.${b64u(JSON.stringify(claims))}.`;
  }

  const header = b64u(
    JSON.stringify({ alg: "RS256", kid: SIGNING.kid, typ: "JWT" }),
  );
  const payload = b64u(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const key = flaw === "sig" ? ROGUE.private : SIGNING.private;
  return `${header}.${payload}.${signer.sign(key).toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** code -> everything needed to mint the id_token, once. */
const codes = new Map();
/** pending id -> the authorize request, until the consent form is submitted. */
const pending = new Map();

const PRESETS = [
  { sub: "google-owner-1", email: "demo@repairflow.app", name: "Demo Owner" },
  { sub: "google-tech-1", email: "tech@repairflow.app", name: "Demo Tech" },
  { sub: "google-desk-1", email: "frontdesk@repairflow.app", name: "Demo Front Desk" },
  { sub: "google-stranger-1", email: "stranger@example.com", name: "A Stranger" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function json(res, status, body, headers = {}) {
  send(res, status, JSON.stringify(body), {
    "Content-Type": "application/json",
    ...headers,
  });
}

function html(res, body) {
  send(res, 200, body, { "Content-Type": "text/html; charset=utf-8" });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function s256(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Sends the browser back to the app with a code, or with an error. */
function bounce(res, redirectUri, params) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  res.writeHead(302, { Location: target.toString() });
  res.end();
}

// ---------------------------------------------------------------------------
// The consent screen
// ---------------------------------------------------------------------------

function consentPage(id, request) {
  const rows = PRESETS.map(
    (preset) => `
      <form method="GET" action="/approve" class="row">
        <input type="hidden" name="pending" value="${esc(id)}">
        <input type="hidden" name="sub" value="${esc(preset.sub)}">
        <input type="hidden" name="email" value="${esc(preset.email)}">
        <input type="hidden" name="name" value="${esc(preset.name)}">
        <input type="hidden" name="verified" value="1">
        <input type="hidden" name="picture" value="http://127.0.0.1:${PORT}/avatar.svg">
        <button type="submit">
          <strong>${esc(preset.name)}</strong>
          <span>${esc(preset.email)}</span>
        </button>
      </form>`,
  ).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Choose an account — fake Google</title>
<style>
  body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f1f3f4;margin:0;padding:40px 16px;color:#202124}
  .card{max-width:460px;margin:0 auto;background:#fff;border:1px solid #dadce0;border-radius:12px;padding:28px}
  h1{font-size:20px;margin:0 0 4px}
  p.sub{margin:0 0 20px;color:#5f6368;font-size:14px}
  .row button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:12px 14px;margin:0 0 8px;background:#fff;border:1px solid #dadce0;border-radius:8px;cursor:pointer;font:inherit;text-align:left}
  .row button:hover{background:#f8f9fa}
  .row span{color:#5f6368;font-size:13px}
  fieldset{margin:22px 0 0;border:1px solid #dadce0;border-radius:8px;padding:14px}
  legend{font-size:13px;font-weight:600;color:#5f6368;padding:0 6px}
  label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}
  input[type=text],select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #dadce0;border-radius:6px;font:inherit}
  .check{display:flex;align-items:center;gap:8px;font-weight:400;margin-top:12px}
  .go{margin-top:14px;width:100%;padding:10px;border:0;border-radius:6px;background:#1a73e8;color:#fff;font:inherit;font-weight:600;cursor:pointer}
  code{background:#f1f3f4;padding:1px 5px;border-radius:4px;font-size:12px}
  .meta{margin-top:20px;color:#5f6368;font-size:12px;word-break:break-all}
</style></head><body>
<div class="card">
  <h1>Choose an account</h1>
  <p class="sub">to continue to <code>${esc(request.client_id)}</code> · this is scripts/dev/fake-google.mjs</p>
  ${rows}

  <form method="GET" action="/approve">
    <input type="hidden" name="pending" value="${esc(id)}">
    <fieldset>
      <legend>Something else</legend>
      <label for="email">Email</label>
      <input id="email" type="text" name="email" value="new.person@example.com">
      <label for="name">Name</label>
      <input id="name" type="text" name="name" value="New Person">
      <label for="sub">Google account id (sub)</label>
      <input id="sub" type="text" name="sub" value="google-${esc(randomUUID().slice(0, 8))}">
      <label for="picture">Profile picture URL</label>
      <input id="picture" type="text" name="picture" value="http://127.0.0.1:${PORT}/avatar.svg">
      <label class="check"><input type="checkbox" name="verified" value="1" checked> Email is verified</label>
      <label for="flaw">Break the id_token</label>
      <select id="flaw" name="flaw">
        <option value="">Nothing — a valid token</option>
        <option value="aud">Wrong audience</option>
        <option value="iss">Wrong issuer</option>
        <option value="nonce">Wrong nonce</option>
        <option value="expired">Expired an hour ago</option>
        <option value="sig">Signed with an unpublished key</option>
        <option value="alg">Unsigned (alg: none)</option>
      </select>
      <button class="go" type="submit">Continue</button>
    </fieldset>
  </form>

  <p class="meta">nonce <code>${esc(request.nonce)}</code><br>challenge <code>${esc(request.code_challenge)}</code></p>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const q = url.searchParams;

  console.log(`${req.method} ${path}`);

  // --- The authorization endpoint -----------------------------------------
  if (path === "/o/oauth2/v2/auth") {
    const redirectUri = q.get("redirect_uri");
    const state = q.get("state");

    if (!redirectUri) return json(res, 400, { error: "invalid_request" });
    if (q.get("response_type") !== "code") {
      return bounce(res, redirectUri, { error: "unsupported_response_type", state: state ?? "" });
    }
    if (q.get("client_id") !== CLIENT_ID) {
      return bounce(res, redirectUri, { error: "invalid_client", state: state ?? "" });
    }
    // PKCE is required of this client, as it should be of any public flow.
    if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
      return bounce(res, redirectUri, { error: "invalid_request", state: state ?? "" });
    }

    const request = {
      client_id: q.get("client_id"),
      redirect_uri: redirectUri,
      state: state ?? "",
      nonce: q.get("nonce") ?? "",
      code_challenge: q.get("code_challenge"),
      scope: q.get("scope") ?? "",
    };

    // `x_deny=1` is the Cancel button on Google's chooser.
    if (q.get("x_deny") === "1") {
      return bounce(res, redirectUri, { error: "access_denied", state: request.state });
    }

    // Scripted mode: everything the consent form would have asked, in the URL.
    if (q.get("x_auto") === "1") {
      return approve(res, request, {
        sub: q.get("x_sub") || "google-auto-1",
        email: q.get("x_email") || "demo@repairflow.app",
        name: q.get("x_name") || "Auto Person",
        picture: q.get("x_picture") || "",
        verified: q.get("x_verified") !== "0",
        flaw: q.get("x_flaw") || "",
      });
    }

    const id = randomUUID();
    pending.set(id, request);
    return html(res, consentPage(id, request));
  }

  // --- The consent form's submit -------------------------------------------
  if (path === "/approve") {
    const request = pending.get(q.get("pending") ?? "");
    if (!request) return json(res, 400, { error: "unknown_request" });
    pending.delete(q.get("pending"));

    return approve(res, request, {
      sub: q.get("sub") || `google-${randomUUID().slice(0, 8)}`,
      email: q.get("email") || "new.person@example.com",
      name: q.get("name") || "New Person",
      picture: q.get("picture") || "",
      verified: q.get("verified") === "1",
      flaw: q.get("flaw") || "",
    });
  }

  // --- The token endpoint ---------------------------------------------------
  if (path === "/token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));

    if (form.get("grant_type") !== "authorization_code") {
      return json(res, 400, { error: "unsupported_grant_type" });
    }
    if (
      form.get("client_id") !== CLIENT_ID ||
      form.get("client_secret") !== CLIENT_SECRET
    ) {
      return json(res, 401, { error: "invalid_client" });
    }

    const entry = codes.get(form.get("code") ?? "");
    // Authorization codes are single use, exactly as Google's are.
    codes.delete(form.get("code") ?? "");
    if (!entry) return json(res, 400, { error: "invalid_grant" });

    if (form.get("redirect_uri") !== entry.redirect_uri) {
      return json(res, 400, { error: "redirect_uri_mismatch" });
    }
    // The PKCE check the whole exchange rests on.
    const verifier = form.get("code_verifier") ?? "";
    if (!verifier || s256(verifier) !== entry.code_challenge) {
      console.log("  ✗ PKCE verifier did not match the challenge");
      return json(res, 400, { error: "invalid_grant" });
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: entry.flaw === "iss" ? "https://accounts.evil.example" : ISSUER,
      azp: CLIENT_ID,
      aud: entry.flaw === "aud" ? "some-other-client.apps.googleusercontent.com" : CLIENT_ID,
      sub: entry.sub,
      email: entry.email,
      email_verified: entry.verified,
      name: entry.name,
      given_name: entry.name.split(" ")[0],
      picture: entry.picture || undefined,
      nonce: entry.flaw === "nonce" ? "not-the-nonce-you-sent" : entry.nonce,
      iat: entry.flaw === "expired" ? now - 7200 : now,
      exp: entry.flaw === "expired" ? now - 3600 : now + 3600,
    };

    console.log(
      `  → id_token for ${entry.email} (verified=${entry.verified}${entry.flaw ? `, flaw=${entry.flaw}` : ""})`,
    );

    return json(res, 200, {
      access_token: `fake_at_${randomUUID()}`,
      expires_in: 3599,
      scope: "openid email profile",
      token_type: "Bearer",
      id_token: mintIdToken(claims, entry.flaw),
    });
  }

  // --- A profile picture, so the avatar in Settings has something to show ---
  if (path === "/avatar.svg") {
    return send(
      res,
      200,
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1a73e8"/><circle cx="48" cy="38" r="16" fill="#fff"/><path d="M16 96c0-17.7 14.3-32 32-32s32 14.3 32 32z" fill="#fff"/></svg>`,
      { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
    );
  }

  // --- JWKS -----------------------------------------------------------------
  if (path === "/oauth2/v3/certs") {
    // A real Cache-Control, because lib/google/oidc.ts honours max-age.
    return json(
      res,
      200,
      { keys: [SIGNING.jwk] },
      { "Cache-Control": "public, max-age=3600, must-revalidate" },
    );
  }

  json(res, 404, { error: "not_found" });
});

/** Mints a code for the chosen identity and sends the browser back. */
function approve(res, request, choice) {
  const code = `fake_code_${randomUUID()}`;
  codes.set(code, {
    redirect_uri: request.redirect_uri,
    code_challenge: request.code_challenge,
    nonce: request.nonce,
    sub: choice.sub,
    email: choice.email,
    name: choice.name,
    picture: choice.picture,
    verified: choice.verified,
    flaw: choice.flaw,
  });
  console.log(`  → code for ${choice.email}${choice.flaw ? ` (flaw=${choice.flaw})` : ""}`);
  return bounce(res, request.redirect_uri, { code, state: request.state });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake-google listening on http://127.0.0.1:${PORT}`);
  console.log(`  client_id  ${CLIENT_ID}`);
  console.log(`  jwks kid   ${SIGNING.kid}`);
});
