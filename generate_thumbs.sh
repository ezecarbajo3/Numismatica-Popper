#!/usr/bin/env bash
# generate_thumbs.sh — Genera miniaturas WebP para el grid del catálogo.
#
# Cada foto de moneda en images/ es un original de ~2800px (250KB–1MB). El grid
# solo las muestra a ~300px, así que descargar y decodificar el original entero
# traba el scroll y demora la aparición de las fotos. Este script crea una versión
# chica en images/thumbs/<nombre>.webp (máx 500px de ancho, calidad 78, ~30KB) que
# el sitio usa en la grilla. Las fotos originales quedan intactas para la vista de
# detalle y el zoom.
#
# Es idempotente: solo (re)genera la miniatura si falta o si el original es más
# nuevo, así las corridas siguientes son casi instantáneas.
#
# Uso:  ./generate_thumbs.sh            # procesa todo images/*.jpeg
#       ./generate_thumbs.sh 236A 236B  # solo esas imágenes (sin extensión)

set -euo pipefail

cd "$(dirname "$0")"

SRC_DIR="images"
THUMB_DIR="images/thumbs"
MAX_WIDTH=500
QUALITY=78

command -v cwebp >/dev/null 2>&1 || {
  echo "ERROR: falta 'cwebp'. Instalalo con: brew install webp" >&2
  exit 1
}

mkdir -p "$THUMB_DIR"

# Construir la lista de originales a procesar.
if [ "$#" -gt 0 ]; then
  files=()
  for name in "$@"; do
    for ext in jpeg jpg JPEG JPG png PNG; do
      [ -f "$SRC_DIR/$name.$ext" ] && files+=("$SRC_DIR/$name.$ext")
    done
  done
else
  # Todos los originales de nivel superior (no descender en thumbs/).
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(
    find "$SRC_DIR" -maxdepth 1 -type f \
      \( -iname '*.jpeg' -o -iname '*.jpg' -o -iname '*.png' \)
  )
fi

made=0; skipped=0; failed=0
for src in "${files[@]}"; do
  base="$(basename "$src")"
  name="${base%.*}"
  out="$THUMB_DIR/$name.webp"

  # Saltear si la miniatura existe y es más nueva que el original.
  if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  if cwebp -quiet -q "$QUALITY" -resize "$MAX_WIDTH" 0 "$src" -o "$out"; then
    made=$((made + 1))
  else
    echo "  ✗ falló: $src" >&2
    failed=$((failed + 1))
  fi
done

echo "Miniaturas: $made generadas, $skipped sin cambios, $failed con error."
