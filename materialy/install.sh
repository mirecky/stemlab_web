#!/usr/bin/env bash
# Nainštaluje prehliadač materiálov do nginx na Raspberry Pi.
# Použitie:  sudo ./install.sh                 (zložka /home/admin/materialy)
#            sudo ./install.sh /ina/cesta      (iná zložka)
set -euo pipefail

MATERIALY_DIR="$(realpath -m "${1:-/home/admin/materialy}")"
UI_DIR=/var/www/materialy-ui
CONF=/etc/nginx/sites-available/materialy
HERE="$(cd "$(dirname "$0")" && pwd)"

[[ $EUID -eq 0 ]] || { echo "Spusti cez sudo."; exit 1; }

mkdir -p "$MATERIALY_DIR"

# Prehliadač (jedna HTML stránka).
install -d "$UI_DIR"
install -m 644 "$HERE/www/index.html" "$UI_DIR/index.html"

# nginx konfigurácia s doplnenými cestami.
sed -e "s|__MATERIALY_DIR__|$MATERIALY_DIR|g" -e "s|__UI_DIR__|$UI_DIR|g" \
  "$HERE/nginx/materialy.conf" > "$CONF"
ln -sf "$CONF" /etc/nginx/sites-enabled/materialy

# nginx (www-data) musí vedieť zložku čítať. Domovská zložka na Raspberry Pi OS
# je 0700 – povolíme iba prechod (x), nie výpis ostatných súborov.
dir="$MATERIALY_DIR"
while [[ "$dir" != "/" ]]; do
  dir="$(dirname "$dir")"
  chmod o+x "$dir"
done
chmod -R o+rX "$MATERIALY_DIR"

nginx -t
systemctl reload nginx

echo
echo "Hotovo. Test na Pi:  curl -I http://127.0.0.1:8080/"
echo "Teraz v Cloudflare pridaj Public Hostname materialy.stemlab.sk → http://localhost:8080 (pozri README.md)."
