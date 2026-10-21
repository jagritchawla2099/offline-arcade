# Where the files and the script tag go

Two things per framework: the folder that is served at the site root (copy `arcade.js`, `arcade-sw.js`, `arcade-offline.html`, and `arcade-register.html` if needed), and the shared `<head>` where this goes:

```html
<script src="/arcade.js" async></script>
```

**Tested end to end:** plain HTML with a Node server, and Next.js (App Router) on Vercel. The rest are the frameworks' standard locations. If anything looks different in the project you're working on, trust the project. To check any setup, after a build `https://<site>/arcade-sw.js` should return the file as JavaScript.

| Framework | Root folder | Shared `<head>` |
|---|---|---|
| Plain HTML | next to `index.html` | every page's `<head>` (or the shared header include) |
| Next.js, App Router | `public/` | `app/layout.tsx`: add `<head><script src="/arcade.js" async /></head>` inside `<html>` |
| Next.js, Pages Router | `public/` | `pages/_document.tsx`: inside `<Head>` |
| Vite (React, Vue, Svelte, vanilla) | `public/` | `index.html` |
| Create React App | `public/` | `public/index.html` |
| Astro | `public/` | base layout `<head>`: `<script is:inline src="/arcade.js" async></script>` (`is:inline` stops Astro bundling it) |
| SvelteKit | `static/` | `src/app.html` |
| Nuxt 3 | `public/` | `nuxt.config`: `app: { head: { script: [{ src: "/arcade.js", async: true }] } }` |
| Remix / React Router 7 | `public/` | `app/root.tsx`, in `<head>` next to `<Meta />` |
| Gatsby | `static/` | `gatsby-ssr.js`: `onRenderBody({ setHeadComponents })` with `<script key="arcade" src="/arcade.js" async />` |
| Angular | `public/` (v17+) or an `assets` entry mapped to `/` | `src/index.html` (if `@angular/service-worker` is present, see `existing-service-worker.md`) |
| Hugo | `static/` | `layouts/partials/head.html` (or the theme's head partial, overridden) |
| Jekyll | site root (make sure `_config.yml` doesn't exclude the files) | `_includes/head.html` |
| Eleventy | passthrough copy to the output root | base layout |
| Rails | `public/` | `app/views/layouts/application.html.erb` |
| Laravel | `public/` | main Blade layout |
| Express | the `express.static` folder mounted at `/` | your view layout |
| Django | static files live under `/static/`, so add root URL routes for the files (or serve them from the web server) | `base.html` |
| WordPress | the WordPress root (the folder with `wp-config.php`), **not** the theme folder | `functions.php`: `add_action('wp_head', fn() => print '<script src="/arcade.js" async></script>', 1);` |

## Framework notes

- **Next.js middleware / proxy.** If a `middleware.ts` / `proxy.ts` redirects or rewrites (auth, locales), make sure its `matcher` skips the arcade files. The common matcher that skips anything with a file extension already does.
- **i18n routing.** The files must answer at `/arcade-...`, not `/en/arcade-...`.
- **WooCommerce.** Add `/cart`, `/checkout` and `/my-account` to `SKIP_PATHS` (the first two are there by default).
- **Single-page apps.** Nothing extra. The worker handles full page loads, and the offline bar covers in-app navigation.

## Can't be done

Hosted site builders that don't let you serve your own files at the root of your domain: Shopify storefronts, Wix, Squarespace, Webflow, Framer, Ghost(Pro). A service worker has to come from the site's own address and root folder. Tell the user it isn't possible on that platform rather than attempting workarounds.
