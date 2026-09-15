#!/usr/bin/env python3
"""Writes public/exercise-illustrations/index.html — the attribution page the licences ask for — from catalogue.json.

CC BY-SA asks for the author, a link to the licence, a link to the source where one exists, and a note of what was changed. Every
line here is read from the catalogue `render.swift` writes, so a movement added to or taken out of the set is added to or taken
out of its credit with it. Run after render.swift.
"""
import html, json, os
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "exercise-illustrations")
catalogue = json.load(open(os.path.join(OUT, "catalogue.json")))

groups = OrderedDict()
for item in sorted(catalogue, key=lambda i: (i["source"], i["name"].lower())):
    groups.setdefault(item["source"], []).append(item)

UPSTREAM = {
    "Everkinetic": ("Everkinetic, by Greg Priday", "https://github.com/everkinetic/data"),
    "Workout Guide": ("Workout Guide, by Bryl Lim (pose artwork partly derived from Everkinetic)", "https://github.com/bryllim/workout-guide"),
}
e = html.escape
sections = []
for source, items in groups.items():
    title, url = UPSTREAM.get(source, (source, ""))
    cards = []
    for i in items:
        frames = " ".join(f"{i['slug']}/{n}.png" for n in range(1, i["frames"] + 1))
        cards.append(
            f'<figure class="card" data-name="{e(i["name"].lower())}">'
            f'<img loading="lazy" src="{e(i["slug"])}/1.png" data-frames="{e(frames)}" alt="{e(i["name"])}" width="360" height="360">'
            f'<figcaption><span class="name">{e(i["name"])}</span>'
            f'<span class="credit">{e(i["author"])} · <a href="{e(i["licenseUrl"])}">{e(i["license"])}</a> · '
            f'<a href="{e(i["sourceUrl"])}">source</a></span></figcaption></figure>')
    sections.append(f'<section><h2>{e(title)}</h2><p class="meta">Source: <a href="{e(url)}">{e(url)}</a> · {len(items)} movements · '
                    f'licence <a href="{e(items[0]["licenseUrl"])}">{e(items[0]["license"])}</a></p>'
                    f'<div class="grid">{"".join(cards)}</div></section>')

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exercise illustrations · Turquoise AI Calorie &amp; Fitness</title>
  <meta name="description" content="The exercise illustrations shown in the Turquoise app, with their credits and licences." />
  <link rel="stylesheet" href="../style.css" />
  <style>
    .credits {{ max-width: 1180px; margin: 110px auto 60px; padding: 0 20px; color: rgba(255,255,255,.85); line-height: 1.6; }}
    .credits h1 {{ color: #fff; font-size: 2.2rem; margin-bottom: 8px; }}
    .credits h2 {{ color: var(--tq, #00bcd4); margin: 40px 0 4px; font-size: 1.4rem; }}
    .credits a {{ color: var(--tq, #00bcd4); }}
    .credits .lead {{ max-width: 760px; }}
    .credits .meta {{ font-size: .9rem; opacity: .8; }}
    .credits input {{ font: inherit; width: 100%; max-width: 360px; margin: 18px 0 4px; padding: 10px 14px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: #fff; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; margin-top: 14px; }}
    .card {{ margin: 0; padding: 10px; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }}
    .card img {{ display: block; width: 100%; height: auto; aspect-ratio: 1; filter: invert(1); }}
    .card figcaption {{ display: grid; gap: 2px; margin-top: 6px; }}
    .card .name {{ color: #fff; font-weight: 600; font-size: .92rem; line-height: 1.3; overflow-wrap: anywhere; }}
    .card .credit {{ font-size: .74rem; opacity: .75; line-height: 1.35; }}
    [hidden] {{ display: none !important; }}
  </style>
</head>
<body>
  <main class="credits">
    <h1>Exercise illustrations</h1>
    <p class="lead">The exercise illustrations in Turquoise AI Calorie &amp; Fitness are {len(catalogue)} line drawings from the open
    projects below, used and shared under their Creative Commons Attribution-ShareAlike licences. The adapted images on this page
    are shared under the same licence, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
    <p class="lead"><strong>Changes made:</strong> each drawing was converted to a single-colour line drawing on a transparent
    360 × 360 canvas, with the poses of one movement cropped to one shared frame. From Workout Guide, frames 1 and 3 of 3 are used.</p>
    <input id="q" type="search" placeholder="Search {len(catalogue)} movements…" aria-label="Search movements">
    {"".join(sections)}
  </main>
  <script>
    // Search, and each visible drawing stepping through its poses — the way the app shows them.
    const cards = [...document.querySelectorAll('.card')];
    document.getElementById('q').addEventListener('input', ev => {{
      const q = ev.target.value.trim().toLowerCase();
      cards.forEach(c => c.hidden = q && !c.dataset.name.includes(q));
    }});
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seen = new Set();
    const io = new IntersectionObserver(entries => entries.forEach(en => en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
    document.querySelectorAll('.card img').forEach(img => io.observe(img));
    let tick = 0;
    if (!still) setInterval(() => {{
      tick++;
      seen.forEach(img => {{ const f = img.dataset.frames.split(' '); if (f.length > 1) img.src = f[tick % f.length]; }});
    }}, 900);
  </script>
</body>
</html>
'''
open(os.path.join(OUT, "index.html"), "w").write(page)
print("credits for", len(catalogue), "movements")
