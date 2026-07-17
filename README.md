# Dogan Can Yucel — Personal Website

Personal portfolio website for [dogancanyucel.com](https://dogancanyucel.com)

## Stack
- Pure HTML5, CSS3, Vanilla JS (no dependencies, no build step)
- Cloudflare Workers + D1 (`exercises`, `supplements`, feedback/email APIs)
- Google Fonts: Outfit + JetBrains Mono

## Features
- Animated particle canvas hero
- Fully responsive (mobile, tablet, desktop)
- Scroll-triggered animations
- Contact form via Worker `/api/contact`
- Dark theme with turquoise accents
- SEO optimized

## Supplement macros API (NIH DSLD)

Slim copy of the NIH Dietary Supplement Label Database lives in D1.
This is a **backend API for the Android app**, not a visible website page.

1. Build slim JSON (one-time / when updating dump):
   ```bash
   node scripts/etl-dsld.mjs "C:/path/to/DSLD-full-database-JSON"
   ```
2. Import into D1:
   ```bash
   node scripts/import-supplements-d1.mjs
   ```
3. Endpoint (requires `x-api-key`):
   ```
   GET /api/supplements?q=whey+protein&limit=20
   ```

Returns: `id, name, brand, serving, calories, protein, carbs, fat, ingredients`.

## Deployment: Cloudflare Pages / Workers

1. Push this folder to the **GitHub repository**
2. Cloudflare deploys from GitHub (Pages/Workers connected to the repo)
3. Custom domain: `dogancanyucel.com`
