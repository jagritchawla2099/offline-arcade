// Offline Arcade client. Include on every page, as early as possible:
//   <script src="/arcade.js" async></script>
// It installs /arcade-sw.js, shows a small bar when the connection drops
// mid-visit, and (optionally) gives your www/non-www twin address its own copy.
(() => {
  // ---- Settings ----
  const MESSAGE = "You're offline. Play a game while you wait?";
  const BUTTON = "Play";
  // Offline bar colours. Keep each text colour readable on its background.
  const BAR_BG = "#202124";
  const BAR_TEXT = "#ffffff";
  const ACCENT = "#2f6fed"; // Play button
  const ACCENT_TEXT = "#ffffff"; // text on the Play button
  // If your site answers on both www and non-www, the address that redirects
  // to this one, e.g. "https://example.com". Leave "" otherwise.
  // See references/twin-domain.md: the twin must serve the arcade files itself.
  const TWIN_ORIGIN = "";
  // The worker to install. Only change this if you merged the arcade into an
  // existing service worker (references/existing-service-worker.md).
  const WORKER = "/arcade-sw.js";
  // -------------------

  if (!("serviceWorker" in navigator)) return;
  // Off on local dev servers (slow compiles would trip the slow-page timer, and the
  // worker would linger on localhost:PORT for other projects). To test locally on a
  // production build: localStorage.setItem("arcade-dev", "1") in the console, reload.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    try { if (localStorage.getItem("arcade-dev") !== "1") return; } catch { return; }
  }

  navigator.serviceWorker.register(WORKER);

  const onBody = (fn) => (document.body ? fn() : addEventListener("DOMContentLoaded", fn));

  // Browsers treat www.example.com and example.com as separate sites, so the
  // twin needs its own copy for people who type that address while offline.
  // Only on the real address pair (never localhost or preview URLs, which would
  // contact production) and only from a top-level page (if the twin is still
  // redirected by the host, the frame lands back here and must not nest).
  const twinHost = TWIN_ORIGIN ? new URL(TWIN_ORIGIN).hostname : "";
  const isPair = twinHost && (location.hostname === "www." + twinHost || "www." + location.hostname === twinHost);
  if (isPair && window.top === window) {
    onBody(() => {
      const frame = document.createElement("iframe");
      frame.src = TWIN_ORIGIN + "/arcade-register.html";
      frame.hidden = true;
      frame.tabIndex = -1;
      frame.setAttribute("aria-hidden", "true");
      document.body.append(frame);
    });
  }

  let bar = null;
  const update = () => {
    const show = !navigator.onLine && !!navigator.serviceWorker.controller;
    if (show && !bar) {
      bar = document.createElement("div");
      bar.setAttribute("role", "status");
      bar.id = "arcade-bar";
      bar.style.cssText =
        "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-width:560px;margin:0 auto;" +
        `display:flex;align-items:center;gap:12px;padding:12px 16px;background:${BAR_BG};color:${BAR_TEXT};` +
        "font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-shadow:0 4px 24px rgba(0,0,0,.25)";
      const text = document.createElement("span");
      text.style.flex = "1";
      text.textContent = MESSAGE;
      const play = document.createElement("button");
      play.textContent = BUTTON;
      play.style.cssText = `background:${ACCENT};color:${ACCENT_TEXT};border:0;padding:6px 16px;font:inherit;font-weight:600;text-transform:uppercase;letter-spacing:.05em;cursor:pointer`;
      // The worker serves its cached copy when the network is down.
      play.onclick = () =>
        location.assign("/arcade-offline.html?from=" + encodeURIComponent(location.pathname + location.search));
      const close = document.createElement("button");
      close.textContent = "×";
      close.setAttribute("aria-label", "Dismiss");
      close.style.cssText = "background:none;color:inherit;border:0;font-size:20px;line-height:1;cursor:pointer;padding:0 4px";
      close.onclick = () => bar.remove();
      bar.append(text, play, close);
      onBody(() => document.body.append(bar));
    } else if (!show && bar) {
      bar.remove();
      bar = null;
    }
  };
  addEventListener("online", update);
  addEventListener("offline", update);
  update();
})();
