---
name: offline-arcade
description: Add an "offline arcade" to any website. When a visitor's connection drops, a page fails to load, or a page is taking too long, they get a small self-hosted games page (Runner, Snake, Flappy, Breakout) instead of the browser's error screen, and are taken back to their page when it's ready. Works with any framework or plain HTML via a service worker. Use this skill whenever someone wants an offline page, offline mode or fallback, a "no internet" / "you're offline" screen, a Chrome-dinosaur-style game on their site, games while a slow page loads, a fun network-error experience, or to keep visitors engaged on bad connections, even if they don't mention games or service workers by name.
---

# Offline Arcade

Adds four mini games that appear when a website can't load:

- **No connection or network error**: any page of the site shows the games instead of the browser's error page. When the connection is back, a "Continue" button returns the visitor to the page they wanted.
- **Slow page** (still loading after 6 s): the games show while the page keeps loading in the background; an "Open page" button appears when it's ready, and opening it is instant.
- **Connection drops mid-visit**: a small bar offers "Play".

**The one limit to tell the user up front:** it works for anyone who has visited the site at least once while online. A device that has never loaded the site has nothing from it, so the browser shows its own offline page (Chrome's dinosaur). No website can change that; it's the browser's page.

## The files

Everything is in `assets/`. Copy them so they're served from the **site root**:

| File | Served at | What it does |
|---|---|---|
| `arcade.js` | `/arcade.js` | Included on every page. Installs the worker, shows the offline bar, sets up the twin domain. |
| `arcade-sw.js` | `/arcade-sw.js` | The service worker. Decides when to show the games. |
| `arcade-offline.html` | `/arcade-offline.html` | The games page. Self-contained (no external files). |
| `arcade-register.html` | `/arcade-register.html` | Only for sites on both `www.` and the bare domain. |

The root matters: a service worker only controls pages inside its own folder, so `/static/arcade-sw.js` would only cover `/static/...` pages. The file names reference each other; keep them, or rename consistently.

## Before you start

Check these first. Each one can make the feature impossible or harmful, so stop and talk to the user if one fails.

1. **The site can serve files at the root path.** Most frameworks have a folder for this (`public/`, `static/`); see `references/frameworks.md`. Hosted builders that don't let you upload root files (Shopify storefronts, Wix, Squarespace, Webflow) can't run this; say so rather than trying workarounds.
2. **HTTPS in production.** Browsers only run service workers on HTTPS (and on localhost).
3. **No existing service worker covering the whole site.** Search the code for `serviceWorker.register`, `workbox`, `next-pwa`, `serwist`, `vite-plugin-pwa`, `@angular/service-worker`, `sw.js`, `service-worker.js`. A site gets one worker per scope, and registering this one at `/` would *replace* an existing one at `/`, breaking push notifications or an existing offline mode. If you find one, read `references/existing-service-worker.md` and ask the user how to proceed.
4. **One address or two?** Find out whether the site answers on both `www.example.com` and `example.com` (one redirecting to the other). Look at redirect config, hosting config, or ask. Browsers treat the two as separate sites, so if people can type the other address, it needs the twin setup in step 6 or they'll get the browser's error page offline.

## Steps

1. **Copy the files** from `assets/` into the folder the site serves at `/`. Skip `arcade-register.html` if the site has only one address.

2. **Make it look like the site.** In `arcade-offline.html`, everything to change is marked `CUSTOMIZE`:
   - the site name in `.logo` (the optional `<span>` after it is drawn in the accent colour; remove it if the brand doesn't use one),
   - the colours in `:root`: `--bg`, `--ink` (text and all game pixels), `--accent` (logo dot, button hover) and `--on-accent` (text on the accent). Take them from the site's design tokens,
   - the `COPY` text, in the site's language and voice. The browser tab shows the status line plus the logo text.

   In `arcade.js`, set the offline bar: `MESSAGE`, `BUTTON`, `BAR_BG`, `BAR_TEXT`, `ACCENT` and `ACCENT_TEXT`.

   Check contrast as you pick colours, because brand accents are often too light for text: `--ink` and `--accent` on `--bg`, `--on-accent` on `--accent` (both light and dark blocks), and both text colours in the bar. Aim for 4.5:1. If the brand's accent can't carry text, use a dark brand colour for the text on it rather than white. Keep the games' pixel style; the page is meant to look like a little arcade, not a copy of the site.

3. **Protect the pages that must never be swapped while slow.** In `arcade-sw.js`, `SKIP_PATHS` lists paths the worker won't replace with games when they're slow and will never store a copy of. Offline, they still get the games. Add the site's own sign-in and auth-callback routes, signed-in areas (`/account`, `/dashboard`, `/settings`, `/app`, `/my-...`), admin, APIs and checkout. Find them in the router, file tree or middleware. Without this, a slow checkout or sign-in could be swapped for games. Entries match a path and everything under it (`"/account"` covers `/account/orders`). Leave `SLOW_MS` at 6000 unless the user wants otherwise; `0` turns slow-page mode off.

4. **Make the four files public.** If the site has middleware or rewrites (auth guards, locale prefixes, trailing-slash rules, catch-all routes), exclude the arcade files. Otherwise the worker can end up caching a login page or a 404 as the games page.

5. **Include the script on every page** in the shared layout or template, as early in `<head>` as possible:

   ```html
   <script src="/arcade.js" async></script>
   ```

   Early matters: a first-time visitor who leaves after a second should still get the games saved. `references/frameworks.md` says where the shared `<head>` is for each framework.

6. **Twin address (only if the site answers on both www and non-www).** Set `TWIN_ORIGIN` in `arcade.js` to the address that redirects (for example `"https://example.com"` when the main site is `www.example.com`), then follow `references/twin-domain.md`. You'll need redirect exceptions and two headers. Often a hosting setting has to change too (the twin must reach the app instead of being redirected by the host). You can't change that yourself, so give the user the exact steps and the safe order to do them in. `arcade.js` only loads the twin from the real address pair, so testing on localhost or preview URLs never contacts the live twin.

7. **Headers.** If the site sets a Content-Security-Policy or framing headers, read `references/headers.md`. Most sites need no change. The worker serves the games page with its own strict policy.

8. **Verify** (next section), then **tell the user** what was added, the first-visit limit, how to try it themselves, and that `VERSION` in `arcade-sw.js` must be bumped whenever they edit the games page.

## Verify

Test a production build (`build` + `start`/`preview`, or a deployed preview), not a dev server. `arcade.js` turns itself off on `localhost`, because dev servers compile slowly enough to trigger the slow-page games, and a worker left on `localhost:3000` would follow you into other projects. To test locally anyway, run `localStorage.setItem("arcade-dev", "1")` in the browser console and reload. The verify script does this automatically.

Run the bundled check (it needs puppeteer; `npm i --no-save puppeteer` installs it with its own Chrome):

```bash
node <skill-dir>/scripts/verify.mjs http://localhost:3000
node <skill-dir>/scripts/verify.mjs https://www.example.com --twin https://example.com   # after deploying
```

It visits the site once, cuts the connection, and checks the offline bar, Play, a new tab opened offline, the twin address, the back-online notice and that normal pages are untouched. Fix any `FAIL` before reporting success. It can't test slow-page mode, which needs a deliberately slow server. You can try that by hand with Chrome DevTools throttling set to a custom profile with ~10 s latency.

The twin can't be tested on `localhost`, because it needs the real hostnames. To test it before deploying, put a local HTTPS proxy in front of the production build and point the real hostnames at it with `CHROME_ARGS`. The recipe is in `references/twin-domain.md`, "Testing before you deploy". Otherwise, test it with `--twin` right after deploying.

By hand: DevTools → Application → Service workers should list `arcade-sw.js` as activated. Then Network → Offline, and reload: you should see the games. When finished, unregister the worker in that panel if you tested in your everyday browser.

## How it works (for debugging)

- `arcade.js` registers `/arcade-sw.js` with scope `/`. On install, the worker caches `/arcade-offline.html`.
- For each page navigation (GET), the worker races the network against `SLOW_MS`:
  - **network error**: it serves the cached games page.
  - **slow**: it serves the games page and keeps the request going. When the page arrives, it keeps it for up to 10 minutes (only plain HTML that isn't marked `private` or `no-store`) and messages the games page, which shows "Open page". Reloading then serves the kept copy. If the page couldn't be kept, the message is "online" and the games page offers "Continue", which loads the page again.
  - **`SKIP_PATHS`**: network only, with the games on a network error. There's no timer and nothing is kept.
- It uses navigation preload, so it doesn't slow down normal page loads. Preload is paused while a page is kept, so "Open page" doesn't make the server build that page a second time. It's turned back on at the next navigation.
- `/arcade-offline.html` is always served from the cache with its own Content-Security-Policy (inline code allowed, nothing external, no framing). That's why it works even on sites with a strict policy.
- The offline bar is driven by `navigator.onLine`. "Play" goes to `/arcade-offline.html?from=<path>`, and "Continue" returns to that path (same site only).
- Back-online detection: when `navigator.onLine` says online, the page confirms with a `HEAD /arcade-offline.html` request.
- **Twin address**: top-level pages on the main address, and only on the real www/non-www pair, load `TWIN_ORIGIN/arcade-register.html` in a hidden iframe. That page runs `arcade.js` on the twin, which installs a copy of the worker there. Same-site frames share storage with the top-level site in Chrome, Firefox and Safari, so that copy answers when someone types the twin address offline.
- **Single-page apps**: in-app link clicks aren't page navigations, so slow-page mode only applies to full loads (first visit, refresh, external links). Offline clicks usually fall back to a full navigation, which the worker catches; the bar covers the rest.

## Updating and removing

- After editing `arcade-offline.html`, bump `VERSION` in `arcade-sw.js`. Visitors get the new copy on their next online visit.
- To remove the feature, delete the script tag. Then, for a few weeks, replace `arcade-sw.js` with this, because visitors' browsers keep a worker until it tells them to drop it:

  ```js
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("offline-arcade-")) await caches.delete(k);
    await self.registration.unregister();
  })()));
  ```
