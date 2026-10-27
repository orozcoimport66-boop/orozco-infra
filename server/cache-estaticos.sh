#!/usr/bin/env bash
# Añade caché de 30 días a los archivos estáticos que existen (imágenes, fuentes, CSS, JS) de
# orozcoimport.es y pre.orozcoimport.es. Los HTML no se tocan: siguen sirviéndose frescos.
# www.orozcoimport.es no se toca: solo redirige a orozcoimport.es, no sirve archivos.
#
# Uso (root):
#   curl -fsSL https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/<commit>/server/cache-estaticos.sh | bash
#
# Seguro: copia de seguridad antes de tocar nada, valida la configuración completa como
# el usuario caddy, recarga sin cortar el servicio y, si algo falla, restaura y recarga.
set -euo pipefail

SITIOS="orozcoimport.es pre.orozcoimport.es"
DIR=/etc/caddy/sites
BACKUPS=/etc/caddy/backups
CADDYFILE=/etc/caddy/Caddyfile
STAMP="$(date +%Y%m%d-%H%M%S)"

die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
ok()  { printf '\033[1;32mOK: %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta como root."
command -v caddy >/dev/null || die "No encuentro caddy en este servidor."
echo "Servidor web: $(caddy version | cut -d' ' -f1) ($(systemctl is-active caddy))"
mkdir -p "$BACKUPS"

# 1. Comprobaciones y copia de seguridad
CAMBIAR=""
for d in $SITIOS; do
  f="$DIR/$d.caddy"
  [ -f "$f" ] || die "No existe $f"
  grep -q 'file_server' "$f" || die "$f no es un sitio estático (no tiene file_server). No toco nada."
  grep -q 'import seguridad' "$f" || die "$f no tiene 'import seguridad' para colocar las líneas. No toco nada."
  if grep -q '@estaticos' "$f"; then
    echo "$d ya tiene la caché de estáticos. Se deja como está."
    continue
  fi
  cp -p "$f" "$BACKUPS/$d.caddy.$STAMP-antes-cache"
  CAMBIAR="$CAMBIAR $d"
done
[ -n "$CAMBIAR" ] || { ok "Nada que cambiar."; exit 0; }
echo "Copias de seguridad en $BACKUPS/*.$STAMP-antes-cache"

restaurar() {
  for d in $CAMBIAR; do cp -p "$BACKUPS/$d.caddy.$STAMP-antes-cache" "$DIR/$d.caddy"; done
}

# 2. Añadir el bloque justo después de 'import seguridad' (solo la primera vez que aparece)
for d in $CAMBIAR; do
  f="$DIR/$d.caddy"
  awk '
    { print }
    !hecho && /import seguridad/ {
      # "file": solo si el archivo existe. Un 404 (imagen que no existe) no se guarda en caché.
      print "\t@estaticos {"
      print "\t\tpath *.webp *.jpg *.jpeg *.png *.svg *.ico *.woff2 *.css *.js"
      print "\t\tfile"
      print "\t}"
      print "\theader @estaticos Cache-Control \"public, max-age=2592000\""
      hecho = 1
    }
  ' "$f" > "$f.tmp"
  chown --reference="$f" "$f.tmp" 2>/dev/null || true
  chmod --reference="$f" "$f.tmp" 2>/dev/null || true
  mv "$f.tmp" "$f"
done

# 3. Validar (como el usuario caddy, igual que oi-site) y recargar sin cortar
chown -R caddy:caddy /var/log/caddy 2>/dev/null || true
if ! runuser -u caddy -- caddy validate --config "$CADDYFILE" --adapter caddyfile >/tmp/cache-estaticos-validate.log 2>&1; then
  restaurar
  tail -n 5 /tmp/cache-estaticos-validate.log >&2
  die "La configuración no es válida. Restaurada la copia: no ha cambiado nada."
fi
ok "Configuración válida"
if ! systemctl reload caddy; then
  restaurar
  systemctl reload caddy || true
  die "Caddy no aceptó la recarga. Restaurada la copia y recargado."
fi
ok "Caddy recargado sin cortar el servicio"

# 4. Comprobar
sleep 2
cabecera() { curl -sS -o /dev/null -D - "$1" | tr -d '\r' | grep -iE '^(HTTP/|cache-control:)' || true; }
fallo=0
echo; echo "=== Comprobaciones ==="
for u in "https://orozcoimport.es/landing/img/caso-1.webp" "https://orozcoimport.es/js/oi-captacion.js?v=3"; do
  echo "--- $u"; r="$(cabecera "$u")"; echo "$r"
  echo "$r" | grep -qi 'cache-control: public, max-age=2592000' || { echo "   ^ FALTA la caché"; fallo=1; }
done
for u in "https://orozcoimport.es/landing/" "https://orozcoimport.es/"; do
  echo "--- $u"; r="$(cabecera "$u")"; echo "$r"
  echo "$r" | grep -qE '^HTTP/[0-9.]+ 200' || { echo "   ^ NO devuelve 200"; fallo=1; }
  echo "$r" | grep -qi 'max-age=2592000' && { echo "   ^ el HTML NO debería llevar caché larga"; fallo=1; }
done
u="https://orozcoimport.es/no-existe-$STAMP.webp"
echo "--- $u (404, sin caché)"; r="$(cabecera "$u")"; echo "$r"
echo "$r" | grep -qi 'max-age=2592000' && { echo "   ^ un 404 NO debería llevar caché"; fallo=1; }
echo "--- https://pre.orozcoimport.es/ (debe seguir con x-robots-tag)"
curl -sS -o /dev/null -D - "https://pre.orozcoimport.es/" | tr -d '\r' | grep -iE '^(HTTP/|x-robots-tag:|cache-control:)' || true

if [ "$fallo" = 1 ]; then
  echo
  restaurar
  systemctl reload caddy || true
  die "Alguna comprobación ha fallado. Restaurada la configuración anterior y recargado."
fi

# 5. Lo que ha cambiado
echo; echo "=== Cambios ==="
for d in $CAMBIAR; do
  diff -u "$BACKUPS/$d.caddy.$STAMP-antes-cache" "$DIR/$d.caddy" || true
done
printf '\n\033[1;32mTODO LISTO.\033[0m Copia y pega a Claude todo lo de arriba.\n'
