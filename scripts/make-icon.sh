#!/usr/bin/env sh
# Erzeugt build/icon.ico (16–256 px) aus public/logo.svg.
# Benötigt: rsvg-convert (librsvg) und ImageMagick 7 (`magick`).
set -eu
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for size in 16 24 32 48 64 128 256; do
  rsvg-convert -w "$size" -h "$size" public/logo.svg -o "$tmp/icon-$size.png"
done
magick "$tmp"/icon-16.png "$tmp"/icon-24.png "$tmp"/icon-32.png "$tmp"/icon-48.png \
  "$tmp"/icon-64.png "$tmp"/icon-128.png "$tmp"/icon-256.png build/icon.ico
echo "build/icon.ico aktualisiert"
