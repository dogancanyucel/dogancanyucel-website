#!/usr/bin/env python3
"""Collects the free exercise illustrations the Turquoise app shows in place of the removed ExerciseDB clips.

Owner, 2026-09-15: take Workout Guide's 302, fill what is missing from the other free sources. Three sources, all line art,
all Creative Commons Attribution-ShareAlike — every image keeps its source, author, licence and the changes made to it, so the
attribution page and the app's credit line are written from the data rather than from memory:

1. Everkinetic (https://github.com/everkinetic/data, CC BY-SA 4.0) — first: two frames, start and end, one hand.
2. Workout Guide (https://github.com/bryllim/workout-guide, CC BY-SA 4.0) — movements Everkinetic does not have. Frames 1 and 3
   only: frame 2 is drawn differently and a loop through it jumps (seen 2026-09-15).
**wger is not used**, though the owner's plan named it. Its images carry a Creative Commons licence each, set by whoever uploaded
them; on 2026-09-15 one of the 40 it would have added ("Dumbbell bicep curl to press") carried a VectorStock watermark — a paid
stock image under a free licence. A licence that can be wrong for one image cannot be trusted for the rest without checking each
by hand, and that risk is the one this set exists to leave behind. The 31 movements it would have added are not worth it; the
style did not match either (labelled anatomy plates, silhouettes, shaded renders).

Writes `work/sources.json` (every chosen movement and where its frames are) and downloads the frames into `work/raw/`. Standard
library only. Re-running skips files already downloaded. `render.swift` turns the raw frames into the published set.
"""
import json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
RAW = os.path.join(WORK, "raw")
UA = {"User-Agent": "dogancanyucel.com exercise-illustrations collector (contact: dogancanyucel.com)"}

EK_JSON = "https://raw.githubusercontent.com/everkinetic/data/main/exercises.json"
EK_PNG = "https://raw.githubusercontent.com/everkinetic/data/main/dist/png/{id}-{pose}.png"
EK_TREE = "https://api.github.com/repos/everkinetic/data/git/trees/main?recursive=1"
WG_MANIFEST = "https://raw.githubusercontent.com/bryllim/workout-guide/HEAD/packages/workout-guide/manifest.json"
WG_PNG = "https://raw.githubusercontent.com/bryllim/workout-guide/HEAD/packages/workout-guide/{path}"
CC_BY_SA_4 = ("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/")


def fetch(url, binary=False):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except Exception as error:  # noqa: BLE001 — a network hiccup is retried, then reported
            if attempt == 2:
                raise RuntimeError(f"{url}: {error}")
            time.sleep(2 * (attempt + 1))


def key(name):
    """A movement's name reduced to its words, so the same lift written two ways is one key."""
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower().replace("-", " ")).split()
    stop = {"with", "on", "the", "a", "an", "and", "to", "for", "of", "in", "using"}
    words = [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words if w not in stop]
    return " ".join(sorted(words))


def slug(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def main():
    os.makedirs(RAW, exist_ok=True)
    chosen, taken = [], set()

    # 1. Everkinetic — only exercises whose both poses exist as PNG.
    tree = {t["path"] for t in fetch(EK_TREE)["tree"]}
    for ex in fetch(EK_JSON):
        frames = [f"dist/png/{ex['id_num']}-{pose}.png" for pose in ("relaxation", "tension")]
        if not all(f in tree for f in frames):
            continue
        k = key(ex["title"])
        if k in taken:
            continue
        taken.add(k)
        chosen.append({
            "slug": slug(ex["title"]), "name": ex["title"], "primary": ex.get("primary", ""),
            "equipment": ex.get("equipment", []),
            "frames": [EK_PNG.format(id=ex["id_num"], pose=p) for p in ("relaxation", "tension")],
            "source": "Everkinetic", "sourceUrl": f"https://github.com/everkinetic/data/blob/main/dist/png/{ex['id_num']}-relaxation.png",
            "author": "Everkinetic (Greg Priday)", "license": CC_BY_SA_4[0], "licenseUrl": CC_BY_SA_4[1],
        })
    ek_count = len(chosen)

    # 2. Workout Guide — what Everkinetic lacks; a pose traced from Everkinetic is Everkinetic's movement already.
    for ex in fetch(WG_MANIFEST):
        traced = (ex.get("attribution", {}).get("source") or {}).get("name") == "Everkinetic"
        k = key(ex["name"])
        if traced or k in taken:
            continue
        pngs = {f["index"]: f["path"].replace(".svg", ".png") for f in ex["frames"]}
        if 1 not in pngs or 3 not in pngs:
            continue
        taken.add(k)
        chosen.append({
            "slug": ex["slug"], "name": ex["name"], "primary": ex.get("primaryMuscle", ""),
            "equipment": [ex["equipment"]] if ex.get("equipment") else [],
            "frames": [WG_PNG.format(path=pngs[1]), WG_PNG.format(path=pngs[3])],
            "source": "Workout Guide", "sourceUrl": f"https://github.com/bryllim/workout-guide/tree/HEAD/packages/workout-guide/assets/{ex['slug']}",
            "author": "Bryl Lim", "license": CC_BY_SA_4[0], "licenseUrl": CC_BY_SA_4[1],
        })
    wg_count = len(chosen) - ek_count

    # Slugs must be unique on disk.
    seen = {}
    for item in chosen:
        base = item["slug"] or "exercise"
        n = seen.get(base, 0)
        seen[base] = n + 1
        if n:
            item["slug"] = f"{base}-{n + 1}"

    # Download.
    for item in chosen:
        item["raw"] = []
        for index, url in enumerate(item["frames"], start=1):
            ext = url.rsplit(".", 1)[-1].split("?")[0].lower()
            path = os.path.join(RAW, f"{item['slug']}-{index}.{ext}")
            if not (os.path.exists(path) and os.path.getsize(path) > 0):
                with open(path, "wb") as f:
                    f.write(fetch(url, binary=True))
            item["raw"].append(os.path.relpath(path, WORK))

    with open(os.path.join(WORK, "sources.json"), "w") as f:
        json.dump(chosen, f, ensure_ascii=False, indent=2)
    print(f"everkinetic {ek_count} · workout guide {wg_count} · total {len(chosen)}")


if __name__ == "__main__":
    sys.exit(main())
