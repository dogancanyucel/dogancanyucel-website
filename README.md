# Dogan Can Yucel — Personal Website

Personal portfolio website for [dogancanyucel.com](https://dogancanyucel.com)

## Stack
- Pure HTML5, CSS3, Vanilla JS (no dependencies, no build step)
- Cloudflare Workers + D1 (site tallies) + R2 (the Turquoise exercise clips, `/api/clips/`)
- Google Fonts: Outfit + JetBrains Mono

## Features
- Animated particle canvas hero
- Fully responsive (mobile, tablet, desktop)
- Scroll-triggered animations
- Contact form via Worker `/api/contact`
- Dark theme with turquoise accents
- SEO optimized

## Retired APIs

`/api/exercises`, `/api/supplements` and `/api/feedback` answer `410 Gone` since 2026-10-24: nothing calls them
(see `index.js`). The D1 tables they read and the scripts that filled them (`scripts/etl-dsld.mjs`,
`scripts/import-supplements-d1.mjs`) are still there until the owner decides whether to drop them.

## Deployment: Cloudflare Pages / Workers

1. Push this folder to the **GitHub repository**
2. Cloudflare deploys from GitHub (Pages/Workers connected to the repo)
3. Custom domain: `dogancanyucel.com`
