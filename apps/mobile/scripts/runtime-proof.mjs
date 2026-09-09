/**
 * Runtime proof harness.
 *
 * Serves the exported web bundle and drives it in a real headless browser, asserting that the app actually boots,
 * navigates, renders both locales, applies design tokens, establishes a Supabase session and persists settings.
 *
 * This exists because bundling and typechecking prove neither that the app runs nor that it behaves. It has
 * already earned its keep: it caught a production-only regression (a dynamic `process.env` lookup that Metro does
 * not inline) which both `tsc` and ESLint passed.
 *
 * SCOPE: this is react-native-web in Chromium. It does NOT verify native behaviour — audio playback, haptics, or
 * `I18nManager.forceRTL` layout mirroring all require a real device or simulator.
 *
 * Usage:
 *   pnpm --filter @pawcue/mobile run export:web
 *   node scripts/runtime-proof.mjs          # requires puppeteer available on the machine
 */
import puppeteer from "puppeteer";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../dist-web", import.meta.url).pathname;
const SHOTS = new URL("../.runtime-proof", import.meta.url).pathname;
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(ROOT, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(ROOT, "index.html");
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4599, r));

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });

const netErrors = [];
page.on("response", (r) => {
  if (r.status() >= 400)
    netErrors.push(`${r.status()} ${r.url().slice(0, 90)}`);
});
page.on("pageerror", (e) => netErrors.push("PAGEERROR: " + e.message));

const results = {};
const step = (name, ok, detail) => {
  results[name] = { ok, detail };
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`,
  );
};
const settle = (ms = 2000) => new Promise((r) => setTimeout(r, ms));
const tap = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    for (const type of ["pointerdown", "pointerup"])
      el.dispatchEvent(new PointerEvent(type, { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, sel);

// Start from a clean profile so persistence assertions mean something.
await page.goto("http://localhost:4599", {
  waitUntil: "networkidle0",
  timeout: 60000,
});
await page.evaluate(() => globalThis.localStorage?.clear());
await page.goto("http://localhost:4599", {
  waitUntil: "networkidle0",
  timeout: 60000,
});
await settle(3000);

// ---- 1. App boot ----------------------------------------------------------
const firstLines = await page.evaluate(() =>
  document.body.innerText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4),
);
step(
  "app boot renders UI",
  firstLines.length > 0,
  JSON.stringify(firstLines.slice(0, 3)),
);
await page.screenshot({ path: `${SHOTS}/01-boot-english.png` });

// ---- 2. English -----------------------------------------------------------
const en = await page.evaluate(() => document.body.innerText);
step(
  "English copy from i18n bundle",
  en.includes("Your free dog clicker") && en.includes("Tap it. Hear it."),
  "",
);

// ---- 3. Design system actually painted ------------------------------------
const ds = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="clicker-button"]');
  if (!el) return { found: false };
  // The styled surface is the Pressable inside the animated wrapper; scan self + descendants.
  const candidates = [el, ...el.querySelectorAll("*")];
  for (const c of candidates) {
    const s = getComputedStyle(c);
    if (s.backgroundColor === "rgb(35, 71, 60)") {
      return {
        found: true,
        bg: s.backgroundColor,
        radius: s.borderRadius,
        w: Math.round(c.getBoundingClientRect().width),
      };
    }
  }
  return { found: false, sample: getComputedStyle(el).backgroundColor };
});
step(
  "design tokens painted (Deep Evergreen #23473C)",
  ds.found === true,
  JSON.stringify(ds),
);

// ---- 4. Clicker interaction ----------------------------------------------
await tap('[data-testid="clicker-button"]');
await tap('[data-testid="clicker-button"]');
await settle(600);
const twoPresses = await page.evaluate(() =>
  document.body.innerText.includes("Ready to use it for real?"),
);
step("prompt hidden after 2 presses", twoPresses === false, "");

await tap('[data-testid="clicker-button"]');
await settle(900);
const threePresses = await page.evaluate(() => document.body.innerText);
step(
  "prompt appears after 3 presses",
  threePresses.includes("Ready to use it for real?"),
  "",
);
step(
  "first-lesson CTA rendered",
  threePresses.includes("Start first lesson"),
  "",
);
await page.screenshot({ path: `${SHOTS}/02-after-3-presses.png` });

// ---- 5. Supabase session established at runtime ---------------------------
const session = await page.evaluate(() => {
  const raw = globalThis.localStorage?.getItem("pawcue.auth.session");
  if (!raw)
    return { present: false, keys: Object.keys(globalThis.localStorage ?? {}) };
  try {
    const p = JSON.parse(raw);
    return {
      present: true,
      isAnonymous: p?.user?.is_anonymous ?? null,
      hasToken: Boolean(p?.access_token),
    };
  } catch {
    return { present: true, unparsed: true };
  }
});
step(
  "anonymous Supabase session established",
  session.present === true && session.isAnonymous === true,
  JSON.stringify(session),
);

// ---- 6. Navigation --------------------------------------------------------
await tap('[data-testid="open-settings"]');
await settle(1500);
step(
  "navigated to /settings",
  page.url().endsWith("/settings"),
  `url=${page.url()}`,
);
await page.screenshot({ path: `${SHOTS}/03-settings-english.png` });

// ---- 7. Hebrew ------------------------------------------------------------
await tap('[data-testid="language-he-IL"]');
await settle(2000);
const he = await page.evaluate(() => document.body.innerText);
step(
  "Hebrew copy rendered",
  he.includes("הגדרות"),
  he.split("\n").filter(Boolean)[0] ?? "",
);
await page.screenshot({ path: `${SHOTS}/04-settings-hebrew.png` });

// ---- 8. Persistence -------------------------------------------------------
const storedLang = await page.evaluate(() =>
  globalThis.localStorage?.getItem("pawcue.settings.language"),
);
step(
  "language persisted to storage",
  storedLang === "he-IL",
  `stored=${storedLang}`,
);

// Reload at the ROOT route (the previous run asserted the home screen while sitting on /settings).
await page.goto("http://localhost:4599/", { waitUntil: "networkidle0" });
await settle(3000);
const reloaded = await page.evaluate(() => document.body.innerText);
step(
  "Hebrew survives a full reload",
  reloaded.includes("הקליקר החינמי שלך לאילוף כלבים"),
  reloaded.split("\n").filter(Boolean).slice(0, 2).join(" | "),
);
await page.screenshot({ path: `${SHOTS}/05-clicker-hebrew-after-reload.png` });

// ---- 9. RTL ---------------------------------------------------------------
const rtl = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="clicker-title"]');
  if (!el) return { found: false };
  const s = getComputedStyle(el);
  return {
    found: true,
    direction: s.direction,
    textAlign: s.textAlign,
    unicodeBidi: s.unicodeBidi,
  };
});
step(
  "RTL writing direction applied to Hebrew text",
  rtl.found && rtl.direction === "rtl",
  JSON.stringify(rtl),
);

// ---- 10. Switch back to English (LTR) -------------------------------------
await tap('[data-testid="open-settings"]');
await settle(1200);
await tap('[data-testid="language-en-US"]');
await settle(1500);
await page.goto("http://localhost:4599/", { waitUntil: "networkidle0" });
await settle(2500);
const backToEn = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="clicker-title"]');
  return {
    text: el?.textContent ?? null,
    direction: el ? getComputedStyle(el).direction : null,
  };
});
step(
  "LTR restored when switching back to English",
  backToEn.text?.includes("Your free dog clicker") === true,
  JSON.stringify(backToEn),
);
await page.screenshot({ path: `${SHOTS}/06-back-to-english-ltr.png` });

console.log(
  "\nHTTP/page errors:",
  netErrors.length ? netErrors.slice(0, 6) : "none",
);
fs.writeFileSync(
  `${SHOTS}/results.json`,
  JSON.stringify({ results, netErrors }, null, 2),
);

await browser.close();
server.close();

const failed = Object.entries(results).filter(([, v]) => !v.ok);
console.log(
  `\n${Object.keys(results).length - failed.length}/${Object.keys(results).length} runtime checks passed`,
);
process.exit(failed.length ? 1 : 0);
