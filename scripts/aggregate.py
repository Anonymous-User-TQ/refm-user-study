#!/usr/bin/env python3
"""Aggregate study responses into the mean rank per method per criterion.

Reads every ``results/responses/*.json`` and writes ``results/aggregate.json``
and a human-readable ``results/aggregate.md``.

Ranks are reported two ways, because with ties allowed the raw mean is not
self-interpreting:

``mean_rank``
    The plain average of the ranks a method received. Lower is better. This is
    the number asked for, but it is sensitive to how liberally each participant
    used ties: a participant who ranks everything 1 pulls every method towards
    1, and one who spreads ranks pulls everything apart.

``mean_normalized``
    The same ranks rescaled per (participant, clip, criterion) to [0, 1] before
    averaging, where 0 is the best rank that participant used on that clip and
    1 the worst. This removes per-participant differences in tie usage, so it is
    the more comparable figure across participants. Reported alongside, not
    instead.

``win_rate``
    Fraction of head-to-head method pairs within a clip that this method ranked
    strictly better in, ties excluded. Independent of scale entirely.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

CRITERIA = ["overall", "penetration", "semantic"]
CRITERION_LABEL = {
    "overall": "Overall quality",
    "penetration": "Self-penetration",
    "semantic": "Semantic preservation",
}
# Display names. Keep in sync with scripts/build_manifest.py.
METHOD_LABEL = {
    "gt": "Ground truth",
    "copy": "Naive copy",
    "humanik": "HumanIK",
    "san": "SAN",
    "r2et": "R2ET",
    "refm_hik": "ReFM-HumanIK",
}


def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def stdev(xs):
    if len(xs) < 2:
        return float("nan")
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def load_responses(folder: Path) -> list[dict]:
    out = []
    for path in sorted(folder.glob("*.json")):
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            print(f"  skipping unreadable {path.name}: {exc}")
            continue
        if doc.get("schema") != "refm-user-study/v1":
            print(f"  skipping {path.name}: unexpected schema")
            continue
        out.append(doc)
    return out


def aggregate(responses: list[dict]) -> dict:
    raw = defaultdict(lambda: defaultdict(list))        # crit -> method -> ranks
    norm = defaultdict(lambda: defaultdict(list))       # crit -> method -> [0,1]
    wins = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # crit -> m -> [w, n]
    participants, clips_seen = set(), set()

    for doc in responses:
        participants.add(doc.get("participantId"))
        for clip in doc.get("clips", []):
            clips_seen.add(clip.get("clipId"))
            for crit, by_method in (clip.get("ranks") or {}).items():
                if crit not in CRITERIA or not by_method:
                    continue
                items = list(by_method.items())
                values = [r for _m, r in items]
                lo, hi = min(values), max(values)
                span = hi - lo

                for method, rank in items:
                    raw[crit][method].append(rank)
                    # A participant who gave every method the same rank carries
                    # no ordering information for this clip; 0.5 keeps them
                    # neutral instead of arbitrarily best or worst.
                    norm[crit][method].append(
                        0.5 if span == 0 else (rank - lo) / span)

                for method, rank in items:
                    for other, other_rank in items:
                        if other == method or rank == other_rank:
                            continue
                        wins[crit][method][1] += 1
                        if rank < other_rank:      # lower rank == better
                            wins[crit][method][0] += 1

    summary = {}
    for crit in CRITERIA:
        rows = []
        for method in sorted(raw[crit], key=lambda m: mean(raw[crit][m])):
            ranks = raw[crit][method]
            w, n = wins[crit][method]
            rows.append({
                "method": method,
                "label": METHOD_LABEL.get(method, method),
                "n": len(ranks),
                "mean_rank": round(mean(ranks), 4),
                "std_rank": round(stdev(ranks), 4) if len(ranks) > 1 else None,
                "mean_normalized": round(mean(norm[crit][method]), 4),
                "win_rate": round(w / n, 4) if n > 0 else None,
            })
        summary[crit] = rows

    return {
        "n_participants": len(participants),
        "n_responses": len(responses),
        "n_clips_covered": len(clips_seen),
        "criteria": CRITERIA,
        "results": summary,
    }


def render_markdown(agg: dict) -> str:
    lines = [
        "# User study results",
        "",
        f"- Participants: **{agg['n_participants']}**",
        f"- Submitted sessions: **{agg['n_responses']}**",
        f"- Distinct clips rated: **{agg['n_clips_covered']}**",
        "",
        "`Mean rank` is the plain average of assigned ranks (lower is better) and is the",
        "headline number. Because ties are allowed, participants differ in how widely they",
        "spread ranks, so `Norm.` (ranks rescaled to [0,1] within each participant-clip)",
        "and `Win rate` (share of strict pairwise wins) are given as scale-free checks.",
        "Rows are ordered best to worst by mean rank.",
        "",
    ]
    for crit in agg["criteria"]:
        rows = agg["results"].get(crit, [])
        lines += [f"## {CRITERION_LABEL.get(crit, crit)}", ""]
        if not rows:
            lines += ["_No responses yet._", ""]
            continue
        lines += [
            "| Method | Mean rank ↓ | SD | Norm. ↓ | Win rate ↑ | n |",
            "|---|---|---|---|---|---|",
        ]
        for r in rows:
            sd = "–" if r["std_rank"] is None else f"{r['std_rank']:.2f}"
            wr = "–" if r["win_rate"] is None else f"{r['win_rate']:.3f}"
            lines.append(
                f"| {r['label']} | **{r['mean_rank']:.3f}** | {sd} | "
                f"{r['mean_normalized']:.3f} | {wr} | {r['n']} |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--responses", default="results/responses")
    ap.add_argument("--out-json", default="results/aggregate.json")
    ap.add_argument("--out-md", default="results/aggregate.md")
    args = ap.parse_args()

    folder = Path(args.responses)
    folder.mkdir(parents=True, exist_ok=True)
    responses = load_responses(folder)
    agg = aggregate(responses)

    Path(args.out_json).write_text(json.dumps(agg, indent=2) + "\n")
    Path(args.out_md).write_text(render_markdown(agg))

    print(f"{agg['n_responses']} response(s), {agg['n_participants']} participant(s), "
          f"{agg['n_clips_covered']} clip(s)")
    for crit in agg["criteria"]:
        rows = agg["results"].get(crit, [])
        if not rows:
            continue
        best = ", ".join(f"{r['label']} {r['mean_rank']:.2f}" for r in rows[:3])
        print(f"  {CRITERION_LABEL[crit]:<24} best: {best}")
    print(f"wrote {args.out_json} and {args.out_md}")


if __name__ == "__main__":
    main()
