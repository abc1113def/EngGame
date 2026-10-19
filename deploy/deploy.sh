#!/usr/bin/env bash
# Сборка на своём компьютере и копирование готового сайта на сервер.
# Использование:  ./deploy/deploy.sh user@your-server [/var/www/a320]
# Собирать на самом сервере (1 ядро / 1 ГБ) не нужно — туда копируется только dist/.
set -euo pipefail

TARGET="${1:?Укажите сервер: ./deploy/deploy.sh user@host [/var/www/a320]}"
DIR="${2:-/var/www/a320}"

cd "$(dirname "$0")/.."
npm ci
npm run build

ssh "$TARGET" "mkdir -p '$DIR'"
# rsync удобнее (копирует только изменения); если его нет — используем scp
if command -v rsync >/dev/null 2>&1; then
  rsync -avz --delete dist/ "$TARGET:$DIR/"
else
  scp -r dist/* "$TARGET:$DIR/"
fi
echo "Готово: файлы в $TARGET:$DIR"
