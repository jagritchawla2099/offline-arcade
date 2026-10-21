# Security headers

Most sites need no header changes. Check these only if the site sends a `Content-Security-Policy` or framing headers. Look in the framework config, server config, middleware, the host's config file, or a `<meta http-equiv>` tag.

## Main site pages

| Directive | Needs | Why |
|---|---|---|
| `script-src` | `'self'` | loads `/arcade.js`. `'unsafe-inline'` is **not** needed. |
| `worker-src` (falls back to `child-src`, `script-src`, `default-src`) | `'self'` | registers `/arcade-sw.js` |
| `frame-src` | the TWIN origin (twin setup only) | the hidden `arcade-register.html` iframe |

## The arcade files

- **`/arcade-sw.js`** must be served as JavaScript (`text/javascript` or `application/javascript`). Serve it with `Cache-Control: no-cache` (or `max-age=0`) if you can. Browsers re-check a worker at least daily anyway, but a long CDN cache can delay updates.
- **`/arcade-offline.html`** needs nothing. The worker always serves it from its cache with its own policy: `default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'`. That allows the page's own inline code, nothing external, and no framing. So it works even when the site's policy forbids inline scripts.
- **`/arcade-register.html`** (twin only, on the TWIN address): `Content-Security-Policy: default-src 'self'; frame-ancestors <MAIN origin>`, and no `X-Frame-Options` (that header can't allow another origin). Exclude the file from any site-wide framing rule.
- **`/arcade.js`** needs nothing special. It styles the offline bar through the DOM (`element.style`), which `style-src 'self'` allows, so strict policies are fine.
- **Preview deployments** (`*.vercel.app`, `*.netlify.app`, staging hosts) get the arcade on their own address and no twin iframe, because `arcade.js` only loads the twin from the real www/non-www pair.

## Less common

- **`Cross-Origin-Embedder-Policy: require-corp`** on MAIN pages blocks the twin iframe unless `arcade-register.html` also sends `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Resource-Policy: cross-origin`.
- **A `Clear-Site-Data` header** with `"storage"` or `"*"` (often on logout) also removes the arcade. It reinstalls on the next page view.
- **Auth walls.** The four files must be reachable without signing in. If a login redirect intercepts `/arcade-offline.html`, the worker caches the login page as the "games page".
