#!/usr/bin/env node
// Offline Arcade verifier: checks a site end to end in headless Chrome.
//
//   node verify.mjs https://www.example.com
//   node verify.mjs https://www.example.com --twin https://example.com
//   node verify.mjs http://localhost:3000        (a production build, not a dev server)
//
// Needs Node 18+ and puppeteer, resolvable from the current folder or this one:
//   npm i --no-save puppeteer            (downloads its own Chrome)
// or puppeteer-core plus an installed Chrome (set CHROME_PATH if it isn't found).
//
// Extra Chrome flags go in CHROME_ARGS, e.g. CHROME_ARGS="--no-sandbox" in CI, or the
// host mapping for testing the www/non-www twin before deploying (references/twin-domain.md).
// Not covered: the slow-page mode (needs a deliberately slow server).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const site = args.find((a) => /^https?:\/\//.test(a) && args[args.indexOf(a) - 1] !== "--twin");
const twin = args.includes("--twin") ? args[args.indexOf("--twin") + 1] : null;
if (!site) {
  console.error("usage: node verify.mjs <site url> [--twin <other address, e.g. https://example.com>]");
  process.exit(2);
}

function load(name) {
  for (const from of [process.cwd(), path.dirname(fileURLToPath(import.meta.url))]) {
    try { return createRequire(path.join(from, "noop.js"))(name); } catch {}
  }
  return null;
}
const puppeteer = load("puppeteer") || load("puppeteer-core");
if (!puppeteer) {
  console.error("puppeteer not found. Run `npm i --no-save puppeteer` here, then try again.");
  process.exit(2);
}
const chromes = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter((p) => p && fs.existsSync(p));

let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = (u) => new URL(u).origin;

if (!load("puppeteer") && !chromes[0]) {
  console.error("puppeteer-core needs Chrome. Install Chrome or set CHROME_PATH, or run `npm i --no-save puppeteer`.");
  process.exit(2);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-verify-"));
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: profile,
  args: (process.env.CHROME_ARGS || "").split(/\s+(?=--)/).filter(Boolean),
  ...(load("puppeteer") ? {} : { executablePath: chromes[0] }),
});
const errors = [];
const newTab = async () => {
  const tab = await browser.newPage();
  tab.on("pageerror", (e) => errors.push(e.message));
  // arcade.js is off on localhost unless opted in; harmless elsewhere.
  await tab.evaluateOnNewDocument(() => { try { localStorage.setItem("arcade-dev", "1"); } catch {} });
  return tab;
};
const origins = [site, twin].filter(Boolean).map(origin);
const workers = () => browser.targets().filter((t) => t.type() === "service_worker" && origins.includes(origin(t.url())));
const setOffline = async (tab, offline) => {
  await tab.setOfflineMode(offline);
  for (const t of workers()) {
    const s = await t.createCDPSession();
    await s.send("Network.enable");
    await s.send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
};
const isArcade = (tab) => tab.evaluate(() => document.documentElement.hasAttribute("data-arcade")).catch(() => false);

try {
  // 1. First visit, online. Through the twin address if given, as many visitors type it.
  let tab = await newTab();
  await tab.goto(twin || site, { waitUntil: "networkidle0", timeout: 60000 });
  let have = [];
  for (let i = 0; i < 40 && !origins.every((o) => have.includes(o)); i++) {
    have = workers().map((t) => origin(t.url()));
    await sleep(500);
  }
  for (const o of origins) {
    const hint = o === origins[0]
      ? "no service worker; is arcade.js on every page?"
      : `is the twin still redirected by the host? curl -I ${o}/arcade-register.html should return 200`;
    check(`arcade installed for ${o}`, have.includes(o), have.includes(o) ? "" : hint);
  }
  await sleep(1500);

  // 2. Connection drops mid-visit: bar, then Play.
  await setOffline(tab, true);
  const bar = await tab.waitForSelector("#arcade-bar button", { timeout: 5000 }).catch(() => null);
  check("offline bar appears when the connection drops", !!bar);
  if (bar) {
    await Promise.all([tab.waitForNavigation().catch(() => {}), bar.click()]);
    check("Play opens the games", await isArcade(tab), tab.url());
  }
  await tab.close();

  // 3. Later, offline, a brand-new tab. The main site's tab is kept for step 4.
  for (const u of [twin, site].filter(Boolean)) {
    tab = await newTab();
    await setOffline(tab, true);
    let err = "";
    await tab.goto(u).catch((e) => (err = e.message.split("\n")[0]));
    check(`offline, new tab, ${u} shows the games`, await isArcade(tab), err);
    if (u !== site) await tab.close();
  }

  // 4. Connection returns: notice, then Continue to the real page.
  await setOffline(tab, false);
  await tab.evaluate(() => dispatchEvent(new Event("online")));
  const go = await tab.waitForFunction(() => { const b = document.querySelector("#go"); return b && !b.hidden && b; }, { timeout: 12000 }).catch(() => null);
  check("back-online notice appears", !!go);
  if (go) {
    await Promise.all([tab.waitForNavigation().catch(() => {}), tab.click("#go")]);
    check("Continue loads the real page", !(await isArcade(tab)), tab.url());
  }

  // 5. Normal browsing is untouched.
  await tab.goto(site, { waitUntil: "domcontentloaded" });
  check("online pages load normally", !(await isArcade(tab)));
  check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  check("run completed", false, e.message);
} finally {
  await browser.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed");
process.exit(fails ? 1 : 0);
