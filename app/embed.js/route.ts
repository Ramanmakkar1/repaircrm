/**
 * `/embed.js` — the one line a shop pastes into their own website.
 *
 *     <script src="https://<app>/embed.js" data-shop="demo" data-mode="button"></script>
 *
 * That is the entire integration. No account on our side to create, no key to
 * copy, no library to install, no build step, nothing to keep up to date — the
 * shop's web person adds one tag and the widget follows whatever the shop later
 * switches on in RepairPilot.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------
 * · NO DEPENDENCIES. Not jQuery, not a framework, not a polyfill. It is one
 *   IIFE of plain DOM calls, because it has to run on a fifteen-year-old
 *   WordPress theme without being asked what else is on the page.
 *
 * · TWO LAYERS OF ISOLATION, IN BOTH DIRECTIONS.
 *     1. Everything this script creates lives inside a SHADOW ROOT. The host
 *        page's CSS cannot reach in (so a theme's `button { … }` cannot restyle
 *        our launcher) and our styles cannot reach out (so nothing we write can
 *        move the shop's own layout).
 *     2. The RepairPilot UI itself is an IFRAME. The app's stylesheet, fonts and
 *        JavaScript never enter the host document at all — the only thing we
 *        add to their page is one empty <div> and this script.
 *   Between them, the worst a broken host page can do is make our button ugly,
 *   and the worst we can do to theirs is nothing.
 *
 * · SAME-ORIGIN BY DERIVATION. The app's origin is read off this script's own
 *   `src`, so the snippet is identical on localhost, on staging and in
 *   production, and a shop that copies it from the wrong environment gets a
 *   widget that points where the script came from rather than a broken one.
 *
 * · ATTRIBUTES, NOT CONFIGURATION OBJECTS. `data-mode`, `data-label`,
 *   `data-color`, `data-position` — a shop owner can edit those in a page
 *   builder's HTML block without touching a bracket.
 *
 * Framing: the hub is served with `frame-ancestors *` on purpose (see
 * next.config.ts) — being embeddable IS the feature. The staff app and the
 * customer portal keep `frame-ancestors 'self'` and refuse to frame anywhere.
 */

const SCRIPT = String.raw`(function () {
  "use strict";

  var tag = document.currentScript;
  if (!tag) return;

  var shop = (tag.getAttribute("data-shop") || "").trim();
  if (!shop) {
    // Nothing to point at. Say so once, in their console, and stop — a widget
    // that silently does nothing is a support call for somebody.
    if (window.console) console.warn("[RepairPilot] embed.js needs a data-shop attribute.");
    return;
  }

  var mode = (tag.getAttribute("data-mode") || "button").toLowerCase();
  if (mode !== "inline" && mode !== "checkin") mode = "button";

  var side = (tag.getAttribute("data-position") || "right").toLowerCase() === "left" ? "left" : "right";
  var label = (tag.getAttribute("data-label") || "").trim() ||
    (mode === "checkin" ? "Check in a device" : "Book a repair");

  // Only a literal hex colour is accepted. Anything else is dropped for the
  // default: this string goes straight into a stylesheet, and "; } body {" is
  // not a colour.
  var raw = (tag.getAttribute("data-color") || "").trim();
  var color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : "#111214";

  var origin = new URL(tag.src, location.href).origin;
  var slug = encodeURIComponent(shop);
  var hubUrl = origin + "/s/" + slug + "?embed=1";
  var checkinUrl = origin + "/checkin/" + slug;
  var frameUrl = mode === "checkin" ? checkinUrl : hubUrl;

  // A dash-named custom element rather than a <div>: it is still a legal
  // attachShadow host, and it means a host page's own "div { … }" rules cannot
  // put a border or a margin on the one element we add to their document.
  var host = document.createElement("repairpilot-embed");
  host.setAttribute("data-repairpilot", mode);
  var root = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    // all:initial is the half of the isolation a shadow root does not give for
    // free: it stops INHERITED properties (font, colour, line-height,
    // direction) from crossing the boundary into our widget.
    ":host{all:initial;display:block}",
    "*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}",
    ".btn{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;",
    "border:0;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:600;line-height:1;color:#fff;cursor:pointer;",
    "background:" + color + ";box-shadow:0 6px 20px rgba(16,24,40,.22);transition:transform .15s ease,box-shadow .15s ease}",
    ".btn:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(16,24,40,.26)}",
    ".btn:focus-visible{outline:3px solid rgba(255,255,255,.6);outline-offset:2px}",
    ".btn svg{width:18px;height:18px;flex:none}",
    ".back{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;",
    "padding:16px;background:rgba(15,18,26,.45);backdrop-filter:blur(2px)}",
    ".panel{position:relative;width:100%;max-width:520px;height:min(88vh,760px);background:#fff;border-radius:16px;",
    "overflow:hidden;box-shadow:0 24px 60px rgba(16,24,40,.28)}",
    ".panel iframe{display:block;width:100%;height:100%;border:0}",
    ".x{position:absolute;top:10px;" + side + ":10px;width:34px;height:34px;border:0;border-radius:999px;cursor:pointer;",
    "background:rgba(255,255,255,.92);color:#101114;font-size:19px;line-height:1;box-shadow:0 2px 8px rgba(16,24,40,.18)}",
    ".x:hover{background:#fff}",
    ".inline{width:100%;border:0}",
    "@media (max-width:520px){.panel{max-width:none;height:100%;border-radius:0}.back{padding:0}}"
  ].join("");
  root.appendChild(style);

  function frame(src, className) {
    var el = document.createElement("iframe");
    el.src = src;
    el.title = "Repairs";
    el.loading = "lazy";
    el.setAttribute("allow", "clipboard-write");
    if (className) el.className = className;
    return el;
  }

  // The host page is told our height by the hub itself, so an inline widget
  // grows when a customer opens one of its forms instead of scrolling inside a
  // fixed box. Only messages from our own origin, and only from the frame we
  // created, are listened to.
  function autosize(el) {
    el.style.height = "560px";
    window.addEventListener("message", function (event) {
      if (event.origin !== origin) return;
      if (!event.data || event.data.type !== "repairpilot:size") return;
      if (el.contentWindow && event.source !== el.contentWindow) return;
      var height = Number(event.data.height);
      if (height > 120 && height < 20000) el.style.height = Math.ceil(height) + "px";
    });
  }

  if (mode === "inline") {
    var inline = frame(hubUrl, "inline");
    autosize(inline);
    root.appendChild(inline);
    tag.parentNode.insertBefore(host, tag);
    return;
  }

  // ------------------------------------------------------------ launcher
  var button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3 4 7v6c0 4.4 3.4 7.6 8 8 4.6-.4 8-3.6 8-8V7z"/><path d="m9 12 2 2 4-4"/></svg>';
  // textContent would wipe the icon, so the label is appended as its own node —
  // which also means a shop's label can never be parsed as markup.
  button.appendChild(document.createTextNode(label));

  var open = null;

  function close() {
    if (!open) return;
    root.removeChild(open);
    open = null;
    document.removeEventListener("keydown", onKey);
    button.style.display = "";
    button.focus();
  }

  function onKey(event) {
    if (event.key === "Escape") close();
  }

  button.addEventListener("click", function () {
    if (open) return close();

    var back = document.createElement("div");
    back.className = "back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "Repairs");

    var panel = document.createElement("div");
    panel.className = "panel";

    var x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.setAttribute("aria-label", "Close");
    x.textContent = "×";
    x.addEventListener("click", close);

    panel.appendChild(frame(frameUrl));
    panel.appendChild(x);
    back.appendChild(panel);
    back.addEventListener("click", function (event) {
      if (event.target === back) close();
    });

    root.appendChild(back);
    open = back;
    // The launcher sits at 2147483000 and the sheet above it; hiding it anyway
    // keeps a floating pill from showing through a translucent backdrop.
    button.style.display = "none";
    document.addEventListener("keydown", onKey);
    x.focus();
  });

  root.appendChild(button);

  function mount() {
    document.body.appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
`;

/**
 * Cacheable, but not for a week: a shop that changes `data-label` should see it
 * immediately (that lives in their own HTML), while the script itself only
 * changes when we deploy. Five minutes in the browser, a day at any CDN in
 * front, and a week of serving stale while it revalidates.
 */
export function GET(): Response {
  return new Response(SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control":
        "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      // The whole point is that it is loaded from someone else's domain.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
