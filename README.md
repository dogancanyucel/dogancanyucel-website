# Dogan Can Yucel — Personal Website

Personal portfolio website for [dogancanyucel.com](https://dogancanyucel.com), and the server ends
of the Turquoise apps.

## Stack

- Pure HTML5, CSS3, vanilla JS — no dependencies, no build step
- Cloudflare Workers, with D1 (the site's tallies) and R2 (the Turquoise exercise clips)
- Inter, served from this site. **No Google Fonts and no other third party**: a font `<link>` hands
  every visitor's IP address to Google, so the file is served from this origin instead (see
  `public/style.css` and `public/website-privacy.html`). `test/no-third-party.test.js` keeps it that way.

## What the site serves

- The home page, the two project pages, and the legal pages the store listings point at
  (`/privacy.html`, `/terms.html`, `/project/cairn/privacy/`, `/project/cairn/terms/`)
- `/website-privacy.html` — what the site itself does: no cookies, two tallies, nothing naming a person
- `/stats` — the owner's view of those tallies, behind a password; 404 when none is configured
- `/turquoise/auth/` — where Firebase's account e-mails land (reset, verify), in the app's 106 languages
- `/api/clips/` — the Turquoise exercise clips from a private R2 bucket, to the genuine app with a
  signed-in user only, so many a minute (`clips.js`)
- `app.dogancanyucel.com` — Apple's association file and the page that opens the app (`app-links.js`)
- `public/app-ads.txt` — the AdMob publisher line, plain text; AdMob verifies the apps' inventory with it

## Retired

- `/api/exercises`, `/api/supplements`, `/api/feedback` — `410 Gone` since 2026-10-24: nothing calls them.
  The D1 tables and the scripts that filled them (`scripts/etl-dsld.mjs`, `scripts/import-supplements-d1.mjs`)
  are still there until the owner decides whether to drop them.
- `/api/verify-email` and `/api/contact` — `410 Gone`. Both could send mail from the owner's domain, or
  put mail in his inbox, for anyone who pressed them; the contact form that used one of them is gone.
- The free exercise drawings, and the map of ExerciseDB media ids they replaced — removed for their licence.

## Tests

```
npm test                      # node, no dependencies
(cd mail-auth && npx vitest run)
```

## Deployment: commit + push = live

Cloudflare Workers Builds deploys from `main` on GitHub. There is no separate deploy step, and
nothing is deployed by hand — a manual `wrangler deploy` once published a file that was not
committed, and the next build from GitHub took it away again.
