# Twin address: www and non-www

Browsers treat `www.example.com` and `example.com` as two different sites. Usually one redirects to the other (say `example.com` → `www.example.com`), so every page view happens on `www.` and only `www.` gets the arcade. Offline, the redirect never happens. Someone who types `example.com` lands on an address that never got a copy and sees the browser's error page.

The fix: pages on the main address quietly load `https://example.com/arcade-register.html` in a hidden iframe. That page runs `arcade.js` on the twin address, which installs a copy of the worker there. Chrome, Firefox and Safari share storage between a site and same-site frames, so that copy answers when someone types `example.com` offline. Tested in Chrome and Brave; the other browsers follow the same storage rules.

Below, MAIN is the address pages live on and TWIN is the one that redirects to it.

## What has to be true

1. **`TWIN_ORIGIN` in `arcade.js`** is set to the TWIN origin, for example `"https://example.com"`.
2. **TWIN reaches your app or server for the four arcade files.** If your host or DNS provider does the redirect itself (Vercel "Redirect to", Cloudflare redirect rules, a registrar's "forwarding"), those files never reach your app. The redirect has to move into your app or server (step 3) or get exceptions.
3. **On TWIN, everything else still redirects** permanently to MAIN, keeping path and query. Only these four paths are served:
   `/arcade.js`, `/arcade-sw.js`, `/arcade-offline.html`, `/arcade-register.html`
4. **`/arcade-register.html` may be framed by MAIN.** Send `Content-Security-Policy: default-src 'self'; frame-ancestors <MAIN origin>` for it, and don't send `X-Frame-Options` for it. If you have a site-wide `X-Frame-Options` or `frame-ancestors 'none'` rule, exclude this one file from it.
5. **MAIN's pages may frame TWIN.** If MAIN sends a Content-Security-Policy that restricts frames (`frame-src`, `child-src`, or a `default-src` without them), add the TWIN origin to `frame-src`.

## Rollout order

Browsers remember a host's permanent redirect. A visitor whose browser gets TWIN's `arcade-register.html` redirected by the host keeps going to MAIN for that file until the cached redirect expires, and gets no twin copy until then. So keep the window between the two changes short, and pick the order that avoids it:

- **The app already redirects TWIN to MAIN itself** (a host-based redirect in the framework config or server, like the recipes below): **change the hosting setting first**. Visitors see no difference, because the app redirects exactly as the host did. Then deploy the code.
- **The app doesn't redirect yet**: deploy the code first, then change the hosting setting straight away. In between, the hidden frame lands on MAIN and does nothing; `arcade.js` won't nest frames.

Then run `scripts/verify.mjs <MAIN url> --twin <TWIN url>`. If "arcade installed for TWIN" fails, `curl -I <TWIN>/arcade-register.html` most likely still shows the host's redirect instead of `200`.

## Testing before you deploy

The twin needs the real hostnames, so `localhost` can't test it. Instead, point the real hostnames at a local HTTPS proxy in a throwaway Chrome. Nothing reaches the live site.

```bash
# 1. Production build of the site running locally, e.g. on :3000. Then a self-signed cert:
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 1 -subj "/CN=local"

# 2. HTTPS proxy on :3443 that keeps the Host header (save as proxy.mjs, run: node proxy.mjs 3000)
cat > proxy.mjs <<'EOF'
import https from "node:https"; import http from "node:http"; import fs from "node:fs";
const port = Number(process.argv[2]);
https.createServer({ key: fs.readFileSync("key.pem"), cert: fs.readFileSync("cert.pem") }, (req, res) => {
  const p = http.request({ host: "localhost", port, path: req.url, method: req.method, headers: req.headers },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on("error", () => req.socket.destroy()); req.pipe(p);
}).listen(3443);
EOF

# 3. Map the real hostnames to the proxy and block every other hostname
CHROME_ARGS="--host-resolver-rules=MAP www.example.com 127.0.0.1:3443, MAP example.com 127.0.0.1:3443, MAP * ~NOTFOUND --ignore-certificate-errors" \
  node scripts/verify.mjs https://www.example.com --twin https://example.com
```

If your app's redirect needs the protocol, have the proxy add `x-forwarded-proto: https`. To check that the test really catches a broken twin, make the proxy redirect TWIN for every path, the way the host would: the two twin checks should then fail.

## Hosting settings the user has to change

You can't change these yourself, so give the user the exact steps for their host.

- **Vercel** (tested): Project → Settings → Domains → the TWIN domain → Edit. Change "Redirect to Another Domain" to "Connect to an environment" → Production, then Save. The app's own redirect (below) then does the redirecting.
- **Cloudflare** (untested): if a Redirect Rule or Page Rule forwards TWIN, exclude the four paths in its expression, e.g. `http.host eq "example.com" and not http.request.uri.path in {"/arcade.js" "/arcade-sw.js" "/arcade-offline.html" "/arcade-register.html"}`. TWIN's DNS record has to point at the same origin as MAIN.
- **Netlify** (untested): Netlify redirects between the bare and `www.` domains on its own. Check whether the four files can be served on the redirected domain. If they can't, the twin setup isn't possible there; tell the user, and they still get the arcade on MAIN.
- **Registrar "domain forwarding"**: the forwarder never reaches your site, so the twin setup isn't possible until TWIN points at your actual host.

## Recipes

### Next.js (`next.config`) (tested)

```js
const MAIN = "https://www.example.com";
const TWIN_HOST = "example.com";
const KEEP = "arcade\\.js$|arcade-sw\\.js$|arcade-offline\\.html$|arcade-register\\.html$";

module.exports = {
  async redirects() {
    return [
      {
        source: `/:path((?!${KEEP}).*)`,
        has: [{ type: "host", value: TWIN_HOST }],
        destination: `${MAIN}/:path`,
        permanent: true,
      },
      // ...existing redirects
    ];
  },
  async headers() {
    return [
      {
        source: "/arcade-register.html",
        headers: [{ key: "Content-Security-Policy", value: `default-src 'self'; frame-ancestors ${MAIN}` }],
      },
      // If you have a site-wide rule with X-Frame-Options or frame-ancestors, change its source
      // from "/:path*" to "/:path((?!arcade-register\\.html$).*)" so it skips that one file,
      // and add `frame-src 'self' https://example.com` to its CSP.
    ];
  },
};
```

If an existing host-based redirect already sends TWIN to MAIN, replace it with the one above rather than adding a second one.

### nginx (untested)

```nginx
server {
  server_name example.com;
  # ...listen/ssl as for www
  location ~ ^/(arcade\.js|arcade-sw\.js|arcade-offline\.html)$ { root /var/www/site; }
  location = /arcade-register.html {
    root /var/www/site;
    add_header Content-Security-Policy "default-src 'self'; frame-ancestors https://www.example.com" always;
  }
  location / { return 301 https://www.example.com$request_uri; }
}
```

### Express (untested)

```js
const KEEP = new Set(["/arcade.js", "/arcade-sw.js", "/arcade-offline.html", "/arcade-register.html"]);
app.use((req, res, next) => {
  if (req.hostname !== "example.com") return next();
  if (!KEEP.has(req.path)) return res.redirect(301, "https://www.example.com" + req.originalUrl);
  if (req.path === "/arcade-register.html") {
    res.removeHeader("X-Frame-Options");
    res.set("Content-Security-Policy", "default-src 'self'; frame-ancestors https://www.example.com");
  }
  next();
});
```

Put it before any middleware that sets `X-Frame-Options` (helmet), or call `removeHeader` after it.
