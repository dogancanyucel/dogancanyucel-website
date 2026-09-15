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
rows = []
for source, items in groups.items():
    title, url = UPSTREAM.get(source, (source, ""))
    rows.append(f'<h2>{e(title)}</h2><p>Source: <a href="{e(url)}">{e(url)}</a> · {len(items)} movements · '
                f'licence <a href="{e(items[0]["licenseUrl"])}">{e(items[0]["license"])}</a></p><ul>')
    for i in items:
        rows.append(f'<li><a href="{e(i["sourceUrl"])}">{e(i["name"])}</a> — {e(i["author"])}, '
                    f'<a href="{e(i["licenseUrl"])}">{e(i["license"])}</a></li>')
    rows.append("</ul>")
changes = sorted({i["changes"] for i in catalogue})

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Exercise illustrations — credits · Turquoise AI Calorie &amp; Fitness</title>
  <meta name="description" content="Credits and licences for the exercise illustrations shown in the Turquoise app." />
  <link rel="stylesheet" href="../style.css" />
  <style>
    .credits {{ max-width: 820px; margin: 110px auto 60px; padding: 0 20px; color: rgba(255,255,255,.85); line-height: 1.6; }}
    .credits h1 {{ color: #fff; font-size: 2.2rem; margin-bottom: 8px; }}
    .credits h2 {{ color: var(--tq, #00bcd4); margin: 36px 0 8px; font-size: 1.4rem; }}
    .credits a {{ color: var(--tq, #00bcd4); }}
    .credits ul {{ columns: 2; column-gap: 28px; padding-left: 18px; font-size: .92rem; }}
    .credits li {{ break-inside: avoid; margin-bottom: 4px; }}
    @media (max-width: 640px) {{ .credits ul {{ columns: 1; }} }}
  </style>
</head>
<body>
  <main class="credits">
    <h1>Exercise illustrations</h1>
    <p>The exercise illustrations in Turquoise AI Calorie &amp; Fitness are {len(catalogue)} line drawings from the open projects
    below, used and shared under their Creative Commons Attribution-ShareAlike licences. The adapted images published at
    <code>/exercise-illustrations/</code> are shared under the same licence,
    <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
    <p><strong>Changes made:</strong> {e(" ".join(changes))}</p>
    {"".join(rows)}
  </main>
</body>
</html>
'''
open(os.path.join(OUT, "index.html"), "w").write(page)
print("credits for", len(catalogue), "movements")
