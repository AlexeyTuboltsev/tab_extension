#!/bin/bash
# Package the extension as an .xpi file (a zip with .xpi extension)
set -e

OUT="container-tab-manager.xpi"
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  background/ \
  content/ \
  data/ \
  shared/ \
  popup/ \
  options/ \
  icons/ \
  -x "*.DS_Store" -x "*__MACOSX*"

echo "Built: $OUT ($(du -h "$OUT" | cut -f1))"
