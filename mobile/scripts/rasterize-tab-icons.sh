#!/usr/bin/env bash
# Rasterize player tab-bar glyphs (Timeline / Tomo / Signal) from canonical SVG
# using librsvg (rsvg-convert). Regenerates @1x / @2x / @3x PNGs for Metro.
# Timeline + Signal SVGs in-repo should match design handoff:
#   ~/Desktop/tomo/files/tab icons/*.svg
#
# Requires: rsvg-convert (brew install librsvg)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/tab-icons/svg"
DST="$ROOT/assets/tab-icons/png"
if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install librsvg, e.g.: brew install librsvg" >&2
  exit 1
fi
mkdir -p "$DST"

# 28pt design (Timeline arc, Signal beacon) — matches viewBox 0 0 28 28
for base in timeline-active timeline-inactive signal-active signal-inactive; do
  rsvg-convert -w 28 -h 28 "$SRC/${base}.svg" -o "$DST/${base}.png"
  rsvg-convert -w 56 -h 56 "$SRC/${base}.svg" -o "$DST/${base}@2x.png"
  rsvg-convert -w 84 -h 84 "$SRC/${base}.svg" -o "$DST/${base}@3x.png"
done

# Tomo planet — raster at logical ORB base 68pt (MainNavigator ORB_SIZE) × scale
for base in tomo-active tomo-inactive; do
  rsvg-convert -w 68 -h 68 "$SRC/${base}.svg" -o "$DST/${base}.png"
  rsvg-convert -w 136 -h 136 "$SRC/${base}.svg" -o "$DST/${base}@2x.png"
  rsvg-convert -w 204 -h 204 "$SRC/${base}.svg" -o "$DST/${base}@3x.png"
done

echo "Wrote PNGs under $DST"
