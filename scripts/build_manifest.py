#!/usr/bin/env python3
"""Scan the video tree and emit assets/clips.json for the study front-end.

Run this after adding or removing clips; the site reads the manifest and never
touches the filesystem itself.

A clip is included only when every ranked method *and* the reference has a video
for it, so a participant can never be shown an incomplete comparison.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

# The reference video is shown for context and is never ranked.
REFERENCE = "original"
# Methods that participants rank. Directory name -> label used in the results
# file. Participants never see these names; the UI relabels them A, B, C...
# per clip.
# Letters are assigned in this order, so reordering this dict changes which
# method a participant sees as A, B, C...
RANKED = {
    "copy": "Naive copy",
    "humanik": "HumanIK",
    "san": "SAN",
    "r2et": "R2ET",
    "refm_hik": "ReFM-HumanIK",
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--videos", default="videos", help="Directory of <method>/<clip>.mp4.")
    ap.add_argument("--out", default="assets/clips.json")
    args = ap.parse_args()

    root = Path(args.videos)
    if not root.is_dir():
        raise SystemExit(f"no such video directory: {root}")

    needed = [REFERENCE, *RANKED]
    missing_dirs = [m for m in needed if not (root / m).is_dir()]
    if missing_dirs:
        raise SystemExit(f"missing method directories: {', '.join(missing_dirs)}")

    # A clip qualifies only if present under every method.
    per_method = {m: {p.name for p in (root / m).glob("*.mp4")} for m in needed}
    common = set.intersection(*per_method.values())
    incomplete = set.union(*per_method.values()) - common

    clips = sorted(common)
    manifest = {
        "reference": REFERENCE,
        "methods": RANKED,
        "videoRoot": str(root),
        "clips": [{"id": Path(c).stem, "file": c} for c in clips],
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"{len(clips)} complete clips x {len(RANKED)} ranked methods -> {out}")
    if incomplete:
        print(f"  skipped {len(incomplete)} clip(s) missing from at least one method:")
        for name in sorted(incomplete):
            absent = [m for m in needed if name not in per_method[m]]
            print(f"    {name}  (absent from: {', '.join(absent)})")


if __name__ == "__main__":
    main()
