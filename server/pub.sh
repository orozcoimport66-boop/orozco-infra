#!/usr/bin/env bash
# Publica una carpeta de sites/ del repo en el servidor SIN pasar por el conector MCP (plan B si el conector falla).
# Uso (root, en la consola de Hetzner):
#   curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/main/server/pub.sh | bash -s <commit> <dominio>
#   ej.: ... | bash -s ca52aa7 panel.orozcoimport.es
# Qué hace: descarga el repo en ese commit, copia sites/<dominio> encima de /srv/sites/<dominio> (no borra archivos
# que ya estén y no vengan en el commit), primero los recursos y el index.html al final, con copia de seguridad antes.
set -euo pipefail
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '\033[1;32mOK: %s\033[0m\n' "$*"; }

C="${1:-}"; D="${2:-}"
[ "$(id -u)" -eq 0 ] || die "Ejecuta como root."
[[ "$C" =~ ^[0-9a-f]{7,40}$ ]] || die "Falta el commit (7 a 40 caracteres hexadecimales)."
[[ "$D" =~ ^[a-z0-9.-]+$ ]] || die "Falta el dominio."
DEST="/srv/sites/$D"
[ -d "$DEST" ] || die "No existe $DEST"

REPO=orozcoimport66-boop/orozco-infra
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/$C.tar.gz" -o "$TMP/r.tgz" \
  || { FULL="$(curl -fsSL "https://api.github.com/repos/$REPO/commits/$C" | grep -m1 '"sha"' | cut -d'"' -f4)"; \
       [ -n "$FULL" ] || die "No encuentro el commit $C"; curl -fsSL "https://github.com/$REPO/archive/$FULL.tar.gz" -o "$TMP/r.tgz"; }
tar -xzf "$TMP/r.tgz" -C "$TMP"
SRC="$(find "$TMP" -mindepth 3 -maxdepth 3 -type d -path "*/sites/$D" | head -1)"
[ -n "$SRC" ] && [ -f "$SRC/index.html" ] || die "El commit $C no tiene sites/$D/index.html"

STAMP="$(date +%Y%m%d-%H%M%S)"
BK="/var/backups/sites/$D-$STAMP"; mkdir -p "$(dirname "$BK")"; cp -a "$DEST" "$BK"
ok "Copia de seguridad en $BK"

OWN="$(stat -c %U:%G "$DEST/index.html" 2>/dev/null || stat -c %U:%G "$DEST")"
# 1) todo menos el index.html raíz, 2) el index.html (así la página nunca apunta a recursos que aún no están)
( cd "$SRC" && find . -type f ! -path ./index.html -print0 | while IFS= read -r -d '' f; do
    install -D -m 0644 "$f" "$DEST/${f#./}"; done )
install -m 0644 "$SRC/index.html" "$DEST/index.html"
chown -R "$OWN" "$DEST"

ok "Publicado sites/$D del commit $C en $DEST"
echo "sha256 del index.html en vivo:"; sha256sum "$DEST/index.html" | cut -c1-16
echo "Si algo va mal, para volver atrás:  rm -rf $DEST && cp -a $BK $DEST"
