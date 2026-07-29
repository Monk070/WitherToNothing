# Wither To Nothing — Official Website

Static site for the band **Wither To Nothing**, live at [withertonothing.com](https://withertonothing.com).

Copyright © 2026 Wither To Nothing. All rights reserved. No license is granted for reuse of the code, artwork, logos, photos, or any other content in this repository.

## Pages

| File | URL | Purpose |
|---|---|---|
| `index.html` | `/` | Landing page — animated sigil, "Follow The Sign" link |
| `home.html` | `/home` | Main page — video embed and band lineup |
| `releases.html` | `/releases` | Music releases |
| `events.html` | `/events` | Live shows |
| `merch.html` | `/merch` | Merchandise |
| `contact.html` | `/contact` | Contact form (relays to the band's Discord) |

Internal links are extensionless (`/home` not `/home.html`) — GitHub Pages serves both.
Shared styling lives in `style.css`; the brand gold is `#f0ad0e` (the `--gold` variable).

## Hosting & domains

- **Hosting:** GitHub Pages, deployed automatically from the `main` branch. Pushes go live in about a minute (10-minute edge cache).
- **withertonothing.com:** DNS at names.co.uk — four GitHub Pages A records on the apex, `www` CNAME to `monk070.github.io`. HTTPS enforced via GitHub's Let's Encrypt cert.
- **withertonothing.co.uk:** nameservers on Cloudflare (free plan); a wildcard Redirect Rule 301s every variant (http/https × www/bare, paths preserved) to `https://withertonothing.com`.
- GitHub occasionally pushes `CNAME` file changes to this repo when Pages settings change — `git pull` before local work.

## Contact form

The form on `/contact` posts JSON to a Cloudflare Worker (`worker/contact-worker.js`), which relays messages to a private Discord channel via webhook.

- **Secrets** (`DISCORD_WEBHOOK_URL`, `TURNSTILE_SECRET`) are stored as Worker secrets in the Cloudflare dashboard — never in this repo.
- **Deploying worker changes is manual:** edits to `worker/contact-worker.js` here do nothing until the file is pasted into the worker's editor in the Cloudflare dashboard (worker → Edit code → paste → Deploy).
- Spam defence layers: Cloudflare Turnstile verification, a hidden honeypot field, server-side email format validation, and a DNS check that the email's domain can receive mail.

## Assets

`Pictures/` holds the band photos, the sigil logo (also used as favicon), and the white title PNG. The title in the site header is recoloured via CSS mask, and the member photos are desaturated via CSS filter — the source images are unedited.
