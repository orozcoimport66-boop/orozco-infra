#!/usr/bin/env bash
# Orozco Import — preparación inicial del servidor (Ubuntu 24.04, x86 o ARM).
# Uso (como root, desde la consola web de Hetzner):
#   curl -fsSL https://raw.githubusercontent.com/<owner>/orozco-infra/<commit>/server/bootstrap.sh | bash
# Es idempotente: se puede volver a lanzar sin romper nada.
set -euo pipefail

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/orozcoimport66-boop/orozco-infra/main}"
TZ_NAME="Europe/Madrid"
SWAP_SIZE="2G"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    ERROR: %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Ejecuta este script como root."
grep -q 'VERSION_ID="24.04"' /etc/os-release || fail "Este script es para Ubuntu 24.04."

export DEBIAN_FRONTEND=noninteractive

log "1/7 Actualizando el sistema"
apt-get update -q
apt-get -y -q -o Dpkg::Options::="--force-confold" upgrade
apt-get -y -q install ca-certificates curl gnupg ufw unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https jq
ok "Sistema actualizado"

log "2/7 Zona horaria y swap"
timedatectl set-timezone "$TZ_NAME"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-orozco.conf
ok "Zona horaria $TZ_NAME, swap $SWAP_SIZE"

log "3/7 Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52orozco-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
systemctl enable --now unattended-upgrades >/dev/null
ok "Parches de seguridad diarios; reinicio automático a las 04:30 si hace falta"

log "4/7 SSH: sin contraseñas y sin root por contraseña"
cat > /etc/ssh/sshd_config.d/00-orozco.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
X11Forwarding no
EOF
mkdir -p /run/sshd   # Ubuntu 24.04 arranca SSH bajo demanda y esta carpeta puede no existir
sshd -t || fail "La configuración de SSH no es válida"
systemctl reload ssh || systemctl reload sshd || true
ok "SSH solo con clave (y el puerto 22 cerrado en el cortafuegos)"

log "5/7 Cortafuegos del servidor (además del de Hetzner)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null   # HTTP/3
ufw --force enable >/dev/null
ok "Abiertos solo 80 y 443"

log "6/7 Instalando Caddy (servidor web con HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get -y -q install caddy
fi
mkdir -p /etc/caddy/sites /etc/caddy/backups /srv/sites /var/log/caddy
chown -R caddy:caddy /var/log/caddy
cat > /etc/caddy/Caddyfile <<'EOF'
# Gestionado por orozco-infra. Cada sitio vive en /etc/caddy/sites/<dominio>.caddy
{
	email orozcoimport66@gmail.com
}

(seguridad) {
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
	encode zstd gzip
}

# Respuesta por IP o dominio desconocido: nada
:80 {
	respond 404
}

import /etc/caddy/sites/*.caddy
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  || fail "El Caddyfile base no es válido"
systemctl enable caddy >/dev/null
systemctl restart caddy
ok "Caddy $(caddy version | cut -d' ' -f1) funcionando"

log "7/7 Herramienta para añadir sitios (oi-site)"
if [ -n "$REPO_RAW" ]; then
  curl -fsSL "$REPO_RAW/server/oi-site" -o /usr/local/bin/oi-site
  chmod 755 /usr/local/bin/oi-site
  ok "oi-site instalado"
else
  echo "    (oi-site se instala aparte: falta REPO_RAW)"
fi

printf '\n\033[1;32mTODO LISTO.\033[0m Servidor %s preparado.\n' "$(hostname)"
printf 'Copia y pega a Claude estas líneas:\n'
printf '  caddy: %s\n' "$(systemctl is-active caddy)"
printf '  ufw: %s\n' "$(ufw status | head -1)"
printf '  swap: %s\n' "$(swapon --show --noheadings | awk '{print $3}')"
printf '  ram: %s\n' "$(free -h | awk '/Mem:/{print $2}')"
printf '  arch: %s\n' "$(uname -m)"
