# When the site already has a service worker

A site gets one service worker per scope. Registering `/arcade-sw.js` with the default scope `/` **replaces** any worker already registered at `/`. That silently breaks what the old one did: push notifications, an existing offline mode, or precaching. So don't just install the arcade. Work out what's there, then ask the user.

## Find out what's there

- Search for `serviceWorker.register(` and note the script URL and `scope`. With no `scope`, it's the script's folder.
- Read the worker, or the plugin config that generates it (`next-pwa`, `@serwist/next`, `vite-plugin-pwa`, Workbox config, `@angular/service-worker` / `ngsw-config.json`).

## Then pick one

**A. The existing worker is on a different scope.** Example: Firebase Messaging's `firebase-messaging-sw.js` registers at `/firebase-cloud-messaging-push-scope` by default. There's no conflict, so install the arcade as normal. Pages inside the other scope stay with the other worker.

**B. It already has an offline fallback** (Workbox `offlineFallback` / navigation fallback, `next-pwa` `fallbacks.document`, a hand-written offline page). Point that fallback at the games page instead of installing a second worker:

- Copy `arcade-offline.html` into the root folder.
- Set the fallback page to `/arcade-offline.html` and make sure it's precached. For example, `fallbacks: { document: "/arcade-offline.html" }` in next-pwa, or `offlineFallback({ pageFallback: "/arcade-offline.html" })` in Workbox recipes.
- Skip `arcade-sw.js` and `arcade.js`, or keep `arcade.js` for the offline bar with `WORKER` set to the existing worker's URL.

The games and the "back online" notice work. Slow-page mode doesn't, because it's part of `arcade-sw.js`.

**C. It doesn't handle page navigations** (push only, analytics, a few cached assets). You can merge the two:

1. Add this line at the **end** of the existing worker file:
   ```js
   importScripts("/arcade-sw.js");
   ```
   At the end, its own listeners run first and keep priority.
2. In `arcade.js`, set `WORKER` to the existing worker's URL, so arcade.js re-registers the same worker instead of replacing it.
3. Note that `arcade-sw.js` calls `skipWaiting()` and `clients.claim()`. A new version of the merged worker then takes over open tabs right away. If the site shows a "new version available, reload" prompt that relies on a waiting worker, that prompt stops appearing. Tell the user.

If you're unsure which case applies, describe what you found and let the user choose. Breaking push notifications is worse than not having games.
