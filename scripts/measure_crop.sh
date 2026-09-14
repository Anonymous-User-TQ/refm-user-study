#!/usr/bin/env bash
# Measure how much white margin the rendered clips carry, and print the CSS
# needed to crop it away.
#
# The videos are 600x600 with the character occupying only the middle portion,
# which wastes tile area in the side-by-side view. This finds the smallest
# square that contains the character across *every frame of every clip*, adds a
# safety pad, and emits the percentages used by `.cell video` in styles.css.
#
# Re-run after re-rendering the stimuli, then paste the output into styles.css.
#
# Usage: scripts/measure_crop.sh [videos_dir] [pad_px]
set -euo pipefail

DIR="${1:-videos}"
PAD="${2:-16}"

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
[ -d "$DIR" ] || { echo "no such directory: $DIR" >&2; exit 1; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# cropdetect looks for dark borders, so negate first to find the white ones.
find "$DIR" -name '*.mp4' -print0 | while IFS= read -r -d '' f; do
  ffmpeg -hide_banner -i "$f" \
    -vf "negate,cropdetect=limit=20:round=2:reset=0" \
    -frames:v 120 -f null - 2>&1 \
  | grep -o 'crop=[0-9]*:[0-9]*:[0-9]*:[0-9]*' | tail -1 >> "$tmp" || true
done

PAD="$PAD" python3 - "$tmp" <<'PY'
import os, sys
boxes = []
for line in open(sys.argv[1]):
    w, h, x, y = map(int, line.strip().split("=")[1].split(":"))
    boxes.append((x, y, x + w, y + h))
if not boxes:
    sys.exit("no crop data; check that the videos decoded")

pad = int(os.environ["PAD"])
l = max(0, min(b[0] for b in boxes) - pad)
t = max(0, min(b[1] for b in boxes) - pad)
r = min(600, max(b[2] for b in boxes) + pad)
b_ = min(600, max(b[3] for b in boxes) + pad)

side = max(r - l, b_ - t)
cx, cy = (l + r) / 2, (t + b_) / 2
ox = max(0, min(600 - side, cx - side / 2))
oy = max(0, min(600 - side, cy - side / 2))
s = 600 / side

print(f"clips measured      : {len(boxes)}")
print(f"content box (+{pad}px): left={l} top={t} right={r} bottom={b_}")
print(f"square crop         : {side}px at ({ox:.0f}, {oy:.0f})  ->  {s:.2f}x larger\n")
print("/* paste into styles.css */")
print(".cell video, .zoom video {")
print("  position: absolute;")
print(f"  width: {s*100:.2f}%; height: {s*100:.2f}%;")
print(f"  left: {-(ox/600)*s*100:.2f}%; top: {-(oy/600)*s*100:.2f}%;")
print("  display: block; background: #fff;")
print("}")
PY
