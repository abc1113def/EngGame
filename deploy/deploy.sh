#!/usr/bin/env bash
# Сборка на своём компьютере и копирование готового сайта на сервер.
# Использование:  ./deploy/deploy.sh user@your-server [/var/www/a320]
# Собирать на сервере не обязательно: туда копируется только папка dist/ (~700 КБ).
set -euo pipefail

TARGET="${1:?Укажите сервер: ./deploy/deploy.sh user@host [/var/www/a320]}"
DIR="${2:-/var/www/a320}"

cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
npm run build

ssh "$TARGET" "mkdir -p '$DIR'"
# rsync копирует только изменения и удаляет старые файлы; без него — scp
if command -v rsync >/dev/null 2>&1 && ssh "$TARGET" "command -v rsync" >/dev/null 2>&1; then
  rsync -avz --delete dist/ "$TARGET:$DIR/"
else
  scp -r dist "$TARGET:/tmp/a320-dist"
  ssh "$TARGET" "rm -rf '$DIR'/* && cp -r /tmp/a320-dist/. '$DIR'/ && rm -rf /tmp/a320-dist"
fi
ssh "$TARGET" "chmod -R a+rX '$DIR'"
echo "Готово: файлы в $TARGET:$DIR"
