#!/usr/bin/env bash
# Подготовка сервера для игры: nginx, папка сайта, конфиг, firewall.
# Запускать НА СЕРВЕРЕ (Ubuntu/Debian, также CentOS/Alma/Rocky):
#
#   sudo bash server-setup.sh                  # игра откроется по http://IP_СЕРВЕРА/
#   sudo bash server-setup.sh game.example.ru  # по домену (A-запись домена → IP сервера)
#   sudo PORT=8080 bash server-setup.sh        # на отдельном порту, если 80-й уже занят другим сайтом
#
# Папку можно сменить: sudo SITE_DIR=/srv/coldDark bash server-setup.sh
set -euo pipefail

DOMAIN="${1:-}"
DIR="${SITE_DIR:-/var/www/a320}"
PORT="${PORT:-80}"
SITE=a320

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите через sudo: sudo bash $0 $*" >&2
  exit 1
fi

echo "==> Устанавливаю nginx"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nginx
elif command -v yum >/dev/null 2>&1; then
  yum install -y epel-release || true
  yum install -y nginx
else
  echo "Не знаю, как поставить nginx на этой системе — установите его вручную и запустите скрипт снова." >&2
  exit 1
fi

echo "==> Папка сайта: $DIR"
mkdir -p "$DIR"
OWNER="${SUDO_USER:-root}"
chown -R "$OWNER": "$DIR"
chmod 755 "$DIR"
if [ ! -f "$DIR/index.html" ]; then
  cat > "$DIR/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>Cold &amp; Dark</title>
<p style="font:16px sans-serif;margin:40px">Сервер готов. Скопируйте сюда файлы игры (содержимое папки <code>dist/</code>).</p>
HTML
  chown "$OWNER": "$DIR/index.html"
fi

# Куда класть конфиг: Debian/Ubuntu — sites-available, RHEL-подобные — conf.d
if [ -d /etc/nginx/sites-available ]; then
  CONF=/etc/nginx/sites-available/$SITE
  LINK=/etc/nginx/sites-enabled/$SITE
else
  CONF=/etc/nginx/conf.d/$SITE.conf
  LINK=""
fi

NAME="${DOMAIN:-_}"
DEF=""
if [ -z "$DOMAIN" ] && [ "$PORT" = "80" ]; then
  # Без домена игра становится сайтом «по умолчанию» на 80-м порту.
  # Стандартную заглушку nginx отключаем, а чужие сайты по умолчанию не трогаем.
  rm -f /etc/nginx/sites-enabled/default
  if grep -rlsE 'listen[^;]*default_server' /etc/nginx/nginx.conf /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -v "/$SITE" | grep -q .; then
    echo "На 80-м порту уже есть сайт по умолчанию. Укажите домен (sudo bash $0 game.example.ru)" >&2
    echo "или отдельный порт (sudo PORT=8080 bash $0)." >&2
    echo "На CentOS/Alma/Rocky такой сайт обычно описан прямо в /etc/nginx/nginx.conf (блок server { listen 80 default_server; ... })." >&2
    exit 1
  fi
  DEF=" default_server"
fi

# IPv6 — только если ядро его поддерживает (на некоторых VPS, например OpenVZ, его нет)
LISTEN6=""
[ -f /proc/net/if_inet6 ] && LISTEN6="listen [::]:$PORT$DEF;"

echo "==> Конфиг nginx: $CONF"
cat > "$CONF" <<NGINX
# Cold & Dark — статический сайт (создано deploy/server-setup.sh)
server {
    listen $PORT$DEF;
    $LISTEN6
    server_name $NAME;

    root $DIR;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;
    gzip_min_length 1024;

    # файлы с хешем в имени можно кешировать надолго
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
NGINX
if [ -n "$LINK" ]; then ln -sf "$CONF" "$LINK"; fi

# SELinux (CentOS/Alma/Rocky): разрешить nginx читать папку
if command -v chcon >/dev/null 2>&1 && command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
  chcon -R -t httpd_sys_content_t "$DIR" || true
fi

echo "==> Firewall"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/tcp"
  [ -n "$DOMAIN" ] && ufw allow 443/tcp
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp"
  [ -n "$DOMAIN" ] && firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
else
  echo "    (firewall не активен — пропускаю)"
fi

echo "==> Проверка и перезапуск nginx"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
if ! systemctl restart nginx 2>/dev/null; then
  # без systemd (контейнеры): запускаем или перечитываем конфиг напрямую
  if pgrep -x nginx >/dev/null 2>&1; then nginx -s reload; else nginx; fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
HOST="${DOMAIN:-${IP:-IP_СЕРВЕРА}}"
SUFFIX=""
[ "$PORT" != "80" ] && SUFFIX=":$PORT"
echo
echo "Готово. Проверка: http://$HOST$SUFFIX/ — должна открыться заглушка «Сервер готов»."
echo "Дальше скопируйте игру в $DIR (см. DEPLOY.md, шаг 3)."
if [ -n "$DOMAIN" ]; then
  echo "HTTPS:  sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMAIN"
fi
