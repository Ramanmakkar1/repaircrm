#!/usr/bin/env bash
#
# Renders the PWA icons from public/icons/icon.svg.
#
# The SVG is the source of truth and is committed alongside the PNGs, which are
# also committed — an install prompt that 404s its icon is a broken install
# prompt, and a build step that needs a rasteriser on every machine is a build
# step that eventually is not run.
#
# Uses macOS `qlmanage` (a QuickLook thumbnail) because it is already on the
# machine; anything that turns an SVG into a square PNG works just as well:
#
#     rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
#
# Re-run only when the brand mark changes:
#
#     bash scripts/dev/make-icons.sh
#
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
icons="$root/public/icons"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for size in 192 512; do
  qlmanage -t -s "$size" -o "$work" "$icons/icon.svg" >/dev/null 2>&1
  mv "$work/icon.svg.png" "$icons/icon-$size.png"
  echo "wrote public/icons/icon-$size.png"
done

# iOS uses its own 180px icon and does not honour the manifest for it.
qlmanage -t -s 180 -o "$work" "$icons/icon.svg" >/dev/null 2>&1
mv "$work/icon.svg.png" "$icons/apple-touch-icon.png"
echo "wrote public/icons/apple-touch-icon.png"
